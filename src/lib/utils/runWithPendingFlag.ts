export async function runWithPendingFlag<T>(
  isPending: () => boolean,
  setPending: (value: boolean) => void,
  action: () => Promise<T>,
): Promise<T | undefined> {
  if (isPending()) {
    return undefined;
  }

  setPending(true);
  try {
    return await action();
  } finally {
    setPending(false);
  }
}
