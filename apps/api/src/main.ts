import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // CORS-origins: lokaal altijd toestaan, plus elke URL die via env-var
  // wordt gegeven (productie + preview). `CORS_ORIGINS` kan een komma-
  // gescheiden lijst zijn ("https://foo.com,https://bar.com") zodat we
  // bv main-Vercel + preview-Vercel tegelijk kunnen toestaan zonder
  // hard-coden. Fallback: leeg → alleen localhost werkt.
  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // WEB_URL is een single-value alias die we ook gebruiken voor mail-
  // links etc. Voegen we automatisch toe aan de CORS-lijst.
  const webUrl = process.env.WEB_URL?.trim();
  if (webUrl) extraOrigins.push(webUrl);

  const allowedOrigins = ['http://localhost:3000', ...extraOrigins];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API draait op poort ${port} (CORS: ${allowedOrigins.join(', ')})`);
}
bootstrap();
