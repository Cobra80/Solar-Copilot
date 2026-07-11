// Déclarations minimales pour les extracteurs sans types officiels.
// (pdf-parse v2 fournit ses propres types — plus besoin de déclaration.)

declare module "mammoth" {
  export function extractRawText(input: {
    buffer: Buffer;
  }): Promise<{ value: string; messages: unknown[] }>;
}
