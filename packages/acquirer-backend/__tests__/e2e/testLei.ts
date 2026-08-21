let leiSequence = 0

export function nextTestLei (): string {
  leiSequence++
  return `TESTLEI${String(leiSequence).padStart(13, '0')}`
}
