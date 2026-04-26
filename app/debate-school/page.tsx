import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Debate School — Debately",
  description: "Preview of Debate School: why debate practice matters.",
};

const skills = [
  {
    title: "Clear thinking",
    text: "A debate forces you to turn a vague opinion into a claim, a reason, and a concrete example.",
  },
  {
    title: "Evidence discipline",
    text: "You learn to separate what sounds true from what you can actually support.",
  },
  {
    title: "Fast rebuttals",
    text: "Good arguments are not just prepared. You need to hear the other side and answer the strongest point.",
  },
  {
    title: "Calm pressure",
    text: "Debating trains you to stay precise when someone pushes back instead of freezing or rambling.",
  },
  {
    title: "Better decisions",
    text: "When you can argue both sides, you notice weak assumptions before they become expensive mistakes.",
  },
  {
    title: "AI-age communication",
    text: "Prompting, reviewing model output, and explaining tradeoffs all depend on the same skill: structured argument.",
  },
];

const practiceLoop = [
  "Pick a topic you actually care about.",
  "Make one claim and support it with evidence.",
  "Answer the strongest counterargument, not the easiest one.",
  "Use the verdict to find the weakest skill.",
  "Run it back and improve one thing at a time.",
];

export default function DebateSchoolPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-12 text-zinc-300">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Back to Debately
      </Link>

      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/20 lg:grid lg:grid-cols-[1fr_0.9fr]">
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-400/90">
            Debate School preview · Lessons coming soon
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Why debate is worth practicing.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            This is not the full Debate School yet. It is a short preview of the
            argument behind it: debate practice matters because it trains you to
            turn a raw opinion into a clear claim, support it, survive pushback,
            and improve from feedback.
          </p>
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-relaxed text-amber-100/90">
            Full guided lessons, drills, and progress paths are coming later.
            For now, use Debately as the practice loop: argue, get judged, then
            run it back with one sharper focus.
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/#topic-picker"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-colors hover:bg-indigo-500"
            >
              Practice now →
            </Link>
            <a
              href="#skills"
              className="rounded-xl border border-zinc-700 bg-zinc-950/50 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Preview the skills
            </a>
          </div>
        </div>
        <div className="relative min-h-[260px] border-t border-zinc-800 bg-zinc-950 lg:border-l lg:border-t-0">
          <img
            src="/debate-school/ancient-debate.png"
            alt="Ancient public debate in a classical forum"
            className="h-full min-h-[260px] w-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent lg:bg-gradient-to-r lg:from-zinc-950/25 lg:to-transparent" />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-100">
            Why it matters
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Debating makes you practice the exact moves behind good writing,
            leadership, product decisions, coding tradeoffs, sales, interviews,
            and using AI well.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-100">
            What Debately scores
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            The Judge looks at evidence, logic, relevance, and rhetoric. That
            means you are not rewarded for sounding loud. You are rewarded for
            building a better argument.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-100">
            What is coming later
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            A proper school flow can add structured lessons, drills, examples,
            and guided progress. This page is just the preview and rationale.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <img
            src="/debate-school/presidential-debate.png"
            alt="Modern debate stage with two speakers and a moderator"
            className="aspect-[16/10] w-full object-cover opacity-90"
          />
          <figcaption className="p-4 text-sm leading-relaxed text-zinc-400">
            Debate is old, but the skill is modern: explain your point, answer
            pressure, and stay clear while someone disagrees.
          </figcaption>
        </figure>
        <figure className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <img
            src="/debate-school/debate-infographic.png"
            alt="Infographic-style illustration of political debate impact"
            className="aspect-[16/10] w-full object-cover opacity-90"
          />
          <figcaption className="p-4 text-sm leading-relaxed text-zinc-400">
            The full school will turn this into lessons. For now, this page is
            the preview: why the practice matters and what it trains.
          </figcaption>
        </figure>
      </section>

      <section id="skills" className="mt-10">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Preview: skills you train
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Debate is not about winning arguments online.
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            It is about learning to think under pressure, explain your ideas,
            and change your mind when the other side is stronger.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <article
              key={skill.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <h3 className="text-base font-semibold text-zinc-100">
                {skill.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {skill.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-indigo-500/25 bg-indigo-950/20 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300">
          Practice loop
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
          Until lessons ship: one debate, one improvement.
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {practiceLoop.map((step, index) => (
            <li
              key={step}
              className="rounded-xl border border-indigo-400/20 bg-zinc-950/45 p-4 text-sm leading-relaxed text-zinc-300"
            >
              <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-indigo-300">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
