/** In-browser geometry check for the fixed long-content Daily Work fixture. */
export function checkWorkLogLayout(cards, expectedHours) {
  if (cards.length === 0) return { status: 'pending', failures: [], cards: 0 }
  const failures = []
  if (cards.length !== expectedHours.length) failures.push('Expected fixture cards missing')
  cards.forEach((card, index) => {
    if (card.titleWidth < 120 || card.titleHeight > 320) failures.push(`Card ${index + 1}: Project identity collapsed`)
    if (card.headerHeight > 480) failures.push(`Card ${index + 1}: Header excessively tall`)
    if (card.contentWidth > card.cardWidth + 1) failures.push(`Card ${index + 1}: Horizontal overflow`)
    if (card.hours !== `${expectedHours[index]}h`) failures.push(`Card ${index + 1}: Exact hours changed`)
  })
  return { status: failures.length ? 'fail' : 'pass', failures, cards: cards.length }
}
