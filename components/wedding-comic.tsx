const atlas = "/images/wedding-comic.png";
export const weddingComicAtlas = atlas;

export function WeddingComic() {
  return (
    <section
      className="wedding-comic"
      aria-label="The wedding mystery in pictures"
    >
      <div className="comic-intro">
        <span className="eyebrow">THE WEDDING WAS GOING SO WELL…</span>
        <h2>One gift. Four suspects. Plenty of drama.</h2>
        <p>
          A playful illustrated opening. Your case brief and evidence contain
          the facts to investigate.
        </p>
      </div>
      <div className="comic-panels">
        <figure>
          <div
            className="comic-art comic-scene-one"
            role="img"
            aria-label="Guests celebrate at a Nigerian wedding beside a table holding a silver gift box."
          />
          <figcaption>
            <b>1 · The celebration</b>
            <span>The outfits? Immaculate. The dance floor? Fully booked.</span>
          </figcaption>
        </figure>
        <figure>
          <div
            className="comic-art comic-scene-two"
            role="img"
            aria-label="Wedding guests react dramatically to an empty place on the gift table."
          />
          <figcaption>
            <b>2 · The plot twist</b>
            <span>
              A silver gift goes missing. Suddenly, everyone has a theory.
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

const portraits: Record<string, string> = {
  dami: "0% 50%",
  tomi: "100% 50%",
  bisi: "0% 100%",
  kunle: "100% 100%",
};
export function WeddingPortrait({ id, name }: { id: string; name: string }) {
  const position = portraits[id];
  if (!position)
    return (
      <span className="avatar" aria-hidden="true">
        {name[0]}
      </span>
    );
  return (
    <span
      className="comic-portrait"
      role="img"
      aria-label={`Illustrated portrait of ${name}`}
      style={{ backgroundPosition: position }}
    />
  );
}
