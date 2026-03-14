export function getEnumKeyValuePairs<T extends Record<string, string | number>>(enumObj: T): Array<{
  key: string,
  value: T[keyof T]
}> {
  const keys = Object.keys(enumObj) as Array<keyof T>;
  // 对于数字枚举，我们会得到双向映射，所以需要过滤掉数字键(因为数字枚举的反向映射会生成数字键，这些数字键是字符串形式)
  const res = keys
    .filter(key => isNaN(Number(key))) // 过滤掉数字键(反向映射的键)
    .map(key => ({ key, value: enumObj[key] }));
  return res as any;
}

export function fromValueGetKey(enumObj: any, value: string | number): string | null {
  for (const i of getEnumKeyValuePairs(enumObj)) {
    if (i.value === value) {
      return i.key;
    }
  }
  return null;
}
