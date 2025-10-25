function createFileKey(file: File) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

export function mergeAttachments(current: File[], incoming: File[]) {
  if (!incoming.length) {
    return { files: current, duplicates: 0 };
  }

  const existingKeys = new Set(current.map(createFileKey));
  const uniqueFiles: File[] = [];
  let duplicateCount = 0;

  for (const file of incoming) {
    const key = createFileKey(file);
    if (existingKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    existingKeys.add(key);
    uniqueFiles.push(file);
  }

  if (uniqueFiles.length === 0) {
    return { files: current, duplicates: duplicateCount };
  }

  return {
    files: [...current, ...uniqueFiles],
    duplicates: duplicateCount,
  };
}
