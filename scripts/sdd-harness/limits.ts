export function validateRunLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("max_calls, se informado, deve ser inteiro positivo seguro");
  return value;
}
