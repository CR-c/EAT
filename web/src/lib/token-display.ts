const KNOWN_AGENT_ORDER = ["codex-cli", "claude-cli", "gemini-cli"] as const

export function formatTokenAmount(amount: number) {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`
  }
  return String(amount)
}

export function sortUsedTokenEntries(tokens?: Record<string, number> | null) {
  const entries = Object.entries(tokens ?? {}).filter(([, amount]) => amount > 0)
  return entries.sort(([left], [right]) => {
    const leftKnownIndex = KNOWN_AGENT_ORDER.indexOf(left as (typeof KNOWN_AGENT_ORDER)[number])
    const rightKnownIndex = KNOWN_AGENT_ORDER.indexOf(right as (typeof KNOWN_AGENT_ORDER)[number])
    const leftRank = leftKnownIndex === -1 ? Number.MAX_SAFE_INTEGER : leftKnownIndex
    const rightRank = rightKnownIndex === -1 ? Number.MAX_SAFE_INTEGER : rightKnownIndex
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }
    return left.localeCompare(right)
  })
}
