// ============================================================
// Vercel-serverless-handler voor de Nest.js API
// ============================================================
//
// Achtergrond: Nest is per design een persistent server (express onder
// de motorkap). Vercel host serverless functions die per request worden
// opgespind en daarna mogen blijven leven binnen een 'warm window'.
// Deze handler overbrugt dat verschil:
//
//   - 1e cold start (instance start vanaf nul):
//       bouw de hele Nest-app op → DI-graph + modules + route-compilatie.
//       Kost ~300-500ms eenmalig.
//   - 2e+ warm calls (zelfde instance, recente activiteit):
//       hergebruik de gecachte express-instance. ~5ms overhead.
//
// Met Vercel Pro + Fluid Compute (in 'n later stadium) blijft een
// instance lang warm en handelt 'ie meerdere requests tegelijk af.
// Effect: bijna persistent-server-gedrag terwijl je toch op Vercel
// host. Zonder Pro/Fluid (huidige plan = Hobby) is elke ~10-15 min idle
// = nieuwe cold start. Aanvaardbaar voor preview-deploy, niet voor
// productie met live klanten.
//
// Belangrijke ontwerpkeuze: we importeren AppModule uit `../dist/`
// (de gecompileerde Nest-output), NIET uit `../src/`. Reden: Vercel's
// @vercel/node bundler heeft moeite met pnpm-workspace dependencies
// (`@getfilly/shared`). Door alleen al-gecompileerde JS te importeren
// blijft de bundler-stap simpel. De build-step in vercel.json regelt
// dat `pnpm --filter api build` is gedraaid vóór deze handler resolved
// wordt — zodat `../dist/app.module` bestaat.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';

// Import van de gebouwde Nest-AppModule. Pad: vanuit apps/api/api/index.ts
// → apps/api/dist/app.module.js (CommonJS-output, dus geen .js-extension
// nodig in TS-source).
import { AppModule } from '../dist/app.module';

// ============================================================
// Module-scope cache
// ============================================================
//
// `cachedServer` blijft bestaan zolang dezelfde serverless-instance
// warm is. Tussen warm invocations herbruiken we 'm. Bij cold start
// is dit `null` en bouwen we opnieuw op.
//
// `bootstrapPromise` is race-safety: als 2 requests tegelijk aankomen
// op een cold start mogen ze NIET allebei een Nest-app gaan bouwen.
// Eerste request start de bootstrap, andere wachten op dezelfde Promise.
// Dit kan in burst-scenarios (bv. dashboard met meerdere fetches
// parallel) gebeuren.

let cachedServer: Express | null = null;
let bootstrapPromise: Promise<Express> | null = null;

// ============================================================
// Bootstrap: bouw de Nest-app op een gegeven express-instance
// ============================================================
//
// Identieke logica als `apps/api/src/main.ts`, alleen:
//   - We injecteren een eigen `express()`-instance in plaats van Nest's
//     default (die zou `app.listen()` proberen, wat in serverless niks
//     doet en alleen verwarrend is in logs).
//   - We roepen `app.init()` aan i.p.v. `app.listen()`. Init definitiveert
//     de DI-graph zonder een poort te openen.

async function bootstrap(): Promise<Express> {
  const server = express();

  // ExpressAdapter zorgt dat Nest z'n routes op de meegegeven instance
  // registreert. Daarna is `server` gewoon callable als (req, res) =>.
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    {
      // Op serverless willen we minder noise in stdout. Vercel-logs
      // worden bij volume betalend; debug-level kan elke request
      // tientallen regels schrijven. Errors + warns blijven, rest weg.
      logger: ['error', 'warn'],
    },
  );

  // Alle endpoints onder /api/* — identiek aan main.ts. De Vercel-route-
  // rewrite in vercel.json zorgt dat /api/* op deze handler landt, dus
  // de prefix is consistent met wat de frontend al gebruikt
  // (`NEXT_PUBLIC_API_URL = https://.../api`).
  app.setGlobalPrefix('api');

  // CORS-config: 1-op-1 gekopieerd uit main.ts. WEB_URL = primary
  // frontend-URL, CORS_ORIGINS = optionele comma-list voor preview-
  // deploys. Localhost altijd toegestaan voor dev.
  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const webUrl = process.env.WEB_URL?.trim();
  if (webUrl) extraOrigins.push(webUrl);

  const allowedOrigins = ['http://localhost:3000', ...extraOrigins];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // init() definitiveert de DI-graph en draait module's `onModuleInit`-
  // hooks. Zonder dit krijg je 404's op elke route (de router is dan
  // wel geconfigureerd maar de DI-graph niet "warmed").
  await app.init();

  return server;
}

// ============================================================
// Vercel-handler entrypoint
// ============================================================
//
// De default-export wordt door @vercel/node per HTTP-request aangeroepen.
// Signature: (req, res) → Promise<void>. We delegeren naar de gecachte
// (of net-gebouwde) express-instance.

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Cold start: bootstrap, met race-safety als meerdere requests
  // tegelijk binnenkomen.
  if (!cachedServer) {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrap();
    }
    cachedServer = await bootstrapPromise;
  }

  // Delegeer naar express → Nest's router → matching controller +
  // guards + pipes + handler. Een express-app is runtime een request-
  // handler-functie, maar het Express-type (@types/express v5) heeft géén
  // call-signature meer — daarom casten we de instance naar de handler-
  // signature. Req/Res worden óók gecast omdat VercelRequest/Response
  // Express's IncomingMessage/ServerResponse uitbreiden via aparte
  // declaration-files (TS herkent dat niet automatisch).
  const expressApp = cachedServer as unknown as (
    req: express.Request,
    res: express.Response,
  ) => void;
  expressApp(
    req as unknown as express.Request,
    res as unknown as express.Response,
  );
}
