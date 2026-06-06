export function calculateElo(
  ratingA: number,
  ratingB: number,
  winnerId: 'A' | 'B'
) {
  const K = 32
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
  const expectedB = 1 - expectedA

  const actualA = winnerId === 'A' ? 1 : 0
  const actualB = winnerId === 'B' ? 1 : 0

  const newRatingA = Math.round(ratingA + K * (actualA - expectedA))
  const newRatingB = Math.round(ratingB + K * (actualB - expectedB))

  return { newRatingA, newRatingB }
}