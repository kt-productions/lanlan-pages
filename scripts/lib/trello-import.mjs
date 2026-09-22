/** 將私人保存的 Trello JSON 匯出轉成匯入批次；呼叫者明確提供看板／欄位對應。 */
export function prepareTrelloImport(boards, { includeArchived, publishTitle }) {
  if (typeof includeArchived !== "boolean" || typeof publishTitle !== "boolean") {
    throw new Error("必須指定封存範圍與名稱公開選項。");
  }
  const seen = new Set();
  const cards = [];
  for (const [boardOrder, { board, service, stages }] of boards.entries()) {
    if (!board || !Array.isArray(board.cards) || !Array.isArray(board.lists)) {
      throw new Error("缺少 Trello 看板資料。");
    }
    if (publishTitle && board.prefs?.permissionLevel !== "public") {
      throw new Error("非公開看板不可直接沿用公開卡片名稱。");
    }
    const lists = new Map(board.lists.map((list) => [list.id, list]));
    for (const card of board.cards) {
      if (card.closed && !includeArchived) continue;
      const list = lists.get(card.idList);
      if (!list || !Object.hasOwn(stages, list.id)) throw new Error("卡片含有未對應的工作欄位。");
      if (seen.has(card.id)) throw new Error("輸入包含重複的 Trello 卡片。");
      seen.add(card.id);
      const labels = (card.labels || []).map((label) => label.name).filter(Boolean);
      cards.push({
        service, status: stages[list.id],
        isRush: labels.some((label) => ["加急", "急單", "急件"].includes(label)),
        isOnHold: labels.includes("擱置"),
        source: {
          kind: "trello", cardId: card.id, boardId: board.id, listId: list.id,
          cardName: card.name, boardName: board.name, listName: list.name,
          cardUrl: card.shortUrl, boardOrder, listPosition: list.pos, cardPosition: card.pos,
          archived: card.closed === true, publishTitle, labels,
          lastActivity: card.dateLastActivity,
          attachments: (card.attachments || []).map((attachment) => ({
            name: attachment.name, url: attachment.url,
          })),
        },
      });
    }
  }
  cards.sort((a, b) => a.source.boardOrder - b.source.boardOrder ||
    a.source.listPosition - b.source.listPosition || a.source.cardPosition - b.source.cardPosition ||
    a.source.cardId.localeCompare(b.source.cardId));
  return { version: 1, cards };
}
