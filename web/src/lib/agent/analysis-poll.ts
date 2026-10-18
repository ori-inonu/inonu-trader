export interface AnalysisRequestState {
 current: { readonly page: number; readonly generation: number; readonly promise: Promise<void> } | null;
}

/** Reuse a request for the selected page/generation; older selections may finish but can never publish. */
export function requestAnalysis<T>(
 active: AnalysisRequestState,
 page: number,
 generation: number,
 read: (page: number) => Promise<T>,
 isCurrent: (page: number, generation: number) => boolean,
 apply: (result: T) => void,
): Promise<void> {
 const pending = active.current;
 if (pending?.page === page && pending.generation === generation) return pending.promise;

 const promise = read(page).then((result) => {
  if (isCurrent(page, generation)) apply(result);
 });
 const request = { page, generation, promise };
 active.current = request;
 const clear = (): void => {
  if (active.current === request) active.current = null;
 };
 void promise.then(clear, clear);
 return promise;
}
