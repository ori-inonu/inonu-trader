/** A refusal of the data source with a constant code the response may carry (never a message with a value in it). */
export class SourceError extends Error {
 /** `onchainosCalls`: the provider calls the click had already spent when it refused; null when the source did not say. */
 constructor(readonly code: string, readonly onchainosCalls: number | null = null) {
  super(code);
 }
}
