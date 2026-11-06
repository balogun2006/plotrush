import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Fingerprint,
  Search,
  Users,
  Check,
  Layers3,
} from "lucide-react";
import { StartButton } from "@/components/start-button";
import { Recommendations } from "@/components/recommendations";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-star">✦</span> YOUR NEXT OBSESSION STARTS WITH
            A CLUE
          </div>
          <h1>
            A little mystery.
            <br />A big <em>aha.</em>
          </h1>
          <p>
            Follow the evidence. Question everything.
            <br className="desktop" /> Turn your spare five minutes into a story
            worth solving.
          </p>
          <div className="hero-actions">
            <StartButton caseId="last-slice" label="Play a free mystery" />
            <Link className="text-link" href="/explore">
              Explore cases <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="hero-promises">
            <span>
              <Check size={14} /> No sign-up
            </span>
            <span>
              <Check size={14} /> No payment
            </span>
            <span>
              <Check size={14} /> Just your instincts
            </span>
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Illustrated evidence board with a missing cake, a time record and detective notes"
          role="img"
        >
          <div className="art-grid" />
          <span className="case-stamp">CASE FILE / 001</span>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-orb" />
          <div className="evidence-photo">
            <div className="cake">
              <div className="cake-top" />
              <div className="cake-side" />
              <div className="cherry" />
            </div>
            <span>THE LAST SLICE</span>
          </div>
          <div className="evidence-note">
            <span>THE TIMELINE</span>
            <strong>14:47</strong>
            <p>
              One open fridge.
              <br />
              Three suspects.
            </p>
            <div className="note-line" />
          </div>
          <div className="art-fingerprint">
            <Fingerprint size={90} strokeWidth={1} />
          </div>
          <div className="art-label">
            <span className="status-dot" /> SOMETHING DOESN’T ADD UP.
          </div>
          <span className="art-star">✳</span>
        </div>
      </section>
      <section className="intro-strip">
        <span>
          <Fingerprint /> Trust your detective instinct.
        </span>
        <p>
          Short stories. Real deductions. That satisfying moment when it all
          clicks.
        </p>
        <span className="strip-number">01 — 03</span>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PICK YOUR PLOT</span>
            <h2>What are you in the mood for?</h2>
          </div>
          <Link className="text-link" href="/explore">
            Browse all cases <ArrowRight size={17} />
          </Link>
        </div>
        <div className="theme-grid">
          <Link
            href="/explore?themes=everyday-mystery&mode=solo"
            className="theme-card everyday"
          >
            <div className="theme-icon">
              <Search size={43} strokeWidth={1.3} />
            </div>
            <div>
              <span className="eyebrow">3 FREE SOLO CASES</span>
              <h3>Everyday Mystery</h3>
              <p>Ordinary places. Unexpected questions.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <div className="theme-card wedding">
            <div className="theme-icon">
              <Layers3 size={43} strokeWidth={1.3} />
            </div>
            <div>
              <span className="eyebrow">IN DEVELOPMENT</span>
              <h3>Wedding & Family</h3>
              <p>A celebration with a twist. Coming later.</p>
            </div>
            <span className="small-pill">Coming soon</span>
          </div>
          <div className="theme-card future">
            <div className="future-icons">
              ✦ <span>?</span> ✦
            </div>
            <div>
              <span className="eyebrow">THE PLOT THICKENS</span>
              <h3>More worlds to uncover</h3>
              <p>Thriller, Cold Case and more are on the way.</p>
            </div>
          </div>
        </div>
      </section>
      <Recommendations />
      <section className="how-section">
        <div>
          <span className="eyebrow">LESS SCROLLING. MORE SOLVING.</span>
          <h2>
            Your inner detective
            <br />
            has plans tonight.
          </h2>
          <p>
            There’s no timer to beat. No friends to round up.
            <br />
            Just you, a handful of clues, and one good question.
          </p>
          <Link href="/explore?access=free&mode=solo" className="button lime">
            Find your first case <ArrowUpRight size={18} />
          </Link>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <div>
              <h3>Choose your mystery</h3>
              <p>Pick a story that sparks your curiosity.</p>
            </div>
            <Search />
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Connect the clues</h3>
              <p>Read the evidence. Keep your own notes.</p>
            </div>
            <Fingerprint />
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Make your call</h3>
              <p>Name your suspect and explain your thinking.</p>
            </div>
            <Check />
          </li>
        </ol>
      </section>
      <section className="group-teaser">
        <Users size={27} />
        <div>
          <h3>Some secrets are better solved together.</h3>
          <p>
            Try a free mystery for 2–6 players. Private clues, shared theories
            and a group reveal.
          </p>
        </div>
        <Link href="/rooms" className="button lime">
          Play together
        </Link>
      </section>
    </>
  );
}
