"use client";

import { useEffect, useRef, useState } from "react";
import { weddingComicAtlas } from "./wedding-comic";

export function WeddingResultCard({
  score,
  solved,
}: {
  score: number;
  solved: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nickname, setNickname] = useState("Detective");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const verdict = solved
    ? "Certified Wedding Detective"
    : "Chief Plot-Twist Survivor";
  useEffect(() => {
    let active = true;
    const illustration = new Image();
    illustration.onload = () => {
      if (!active || !canvas.current) return;
      const context = canvas.current.getContext("2d");
      if (!context) return;
      const c = context;
      c.fillStyle = "#211a35";
      c.fillRect(0, 0, 1200, 630);
      c.drawImage(
        illustration,
        0,
        0,
        illustration.naturalWidth / 2,
        illustration.naturalHeight / 3,
        0,
        0,
        630,
        630,
      );
      c.fillStyle = "#fffaf0";
      c.fillRect(610, 0, 590, 630);
      c.fillStyle = "#211a35";
      c.font = "bold 34px sans-serif";
      c.fillText("plotrush.", 658, 70);
      c.font = "bold 25px sans-serif";
      c.fillText(
        (nickname.trim() || "Detective").replace(/[\u0000-\u001f]/g, ""),
        658,
        133,
        486,
      );
      c.font = "bold 72px sans-serif";
      c.fillText(`${score}/100`, 658, 225);
      c.font = "bold 26px sans-serif";
      c.fillText(verdict, 658, 286, 486);
      c.font = "22px sans-serif";
      c.fillText("The Missing Wedding Gift", 658, 346);
      c.fillText("The gift vanished. I have opinions.", 658, 391);
      c.fillStyle = "#d9f769";
      c.fillRect(650, 443, 510, 65);
      c.fillStyle = "#211a35";
      c.font = "bold 24px sans-serif";
      c.fillText("Can you crack the case?", 676, 484);
      c.font = "18px sans-serif";
      c.fillText("Play the mystery on PlotRush", 658, 566);
      c.fillText(location.host, 658, 598, 486);
      setReady(true);
    };
    illustration.onerror = () => {
      if (active)
        setMessage(
          "The picture could not load. You can still share your text result below.",
        );
    };
    illustration.src = weddingComicAtlas;
    return () => {
      active = false;
    };
  }, [nickname, score, verdict]);

  async function picture(share: boolean) {
    try {
      const card = canvas.current;
      if (!card) throw new Error("Picture unavailable");
      const blob = await new Promise<Blob>((resolve, reject) =>
        card.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Picture unavailable")),
          "image/png",
        ),
      );
      const file = new File([blob], "plotrush-wedding-result.png", {
        type: "image/png",
      });
      if (share && navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: "My PlotRush wedding mystery result",
          text: `I scored ${score}/100. Can you crack The Missing Wedding Gift? ${location.origin}/shop`,
        });
        setMessage("Result card shared.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Result card downloaded. Add it to your post or story.");
      }
    } catch {
      setMessage(
        "Picture sharing was cancelled or unavailable. You can try again.",
      );
    }
  }
  return (
    <section className="wedding-postcard">
      <span className="eyebrow">A LITTLE BRAGGING MATERIAL</span>
      <h2>Your detective moment, in pictures.</h2>
      <label htmlFor="detective-nickname">Nickname on your card</label>
      <input
        id="detective-nickname"
        maxLength={24}
        value={nickname}
        onChange={(event) => {
          setReady(false);
          setNickname(event.target.value);
        }}
      />
      <canvas
        ref={canvas}
        width={1200}
        height={630}
        role="img"
        aria-label={`Spoiler-free result card for ${nickname || "Detective"}, ${score} out of 100, ${verdict}.`}
      >
        Your score is {score}/100 on The Missing Wedding Gift.
      </canvas>
      <p>
        Your card shows your nickname and score. Choose a nickname you are happy
        to share.
      </p>
      <div className="result-actions">
        <button
          type="button"
          className="button lime"
          disabled={!ready}
          onClick={() => void picture(false)}
        >
          Download result card
        </button>
        <button
          type="button"
          className="button outline"
          disabled={!ready}
          onClick={() => void picture(true)}
        >
          Share picture
        </button>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
