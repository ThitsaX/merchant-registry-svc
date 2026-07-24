import { randomInt } from 'crypto'

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*_-+='
const ALL_CHARACTERS = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS

function randomCharacter (characters: string): string {
  return characters[randomInt(characters.length)]
}

export function generateTemporaryPassword (length = 16): string {
  if (length < 12) {
    throw new Error('Temporary passwords must be at least 12 characters')
  }

  const characters = [
    randomCharacter(LOWERCASE),
    randomCharacter(UPPERCASE),
    randomCharacter(DIGITS),
    randomCharacter(SYMBOLS)
  ]

  while (characters.length < length) {
    characters.push(randomCharacter(ALL_CHARACTERS))
  }

  for (let index = characters.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }

  return characters.join('')
}
