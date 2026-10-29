export const peopleKeys = {
  list: (ownerId: string) => ['people', ownerId, 'list'] as const,
  detail: (ownerId: string, id: string) => ['people', ownerId, 'detail', id] as const,
}
