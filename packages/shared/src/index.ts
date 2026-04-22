/**
 * Entry-point van de @getfilly/shared package.
 *
 * Alles wat we via `import { ... } from '@getfilly/shared'` in
 * apps/api en apps/web willen kunnen gebruiken, exporteren we hier.
 *
 * Structuur: we verzamelen exports uit de submodules. Nieuwe modules
 * (bv. shared types voor Guest/Campaign) voeg je hier toe.
 */
export * from './permissions';
