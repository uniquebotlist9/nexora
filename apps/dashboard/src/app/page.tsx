import Link from 'next/link';
import {
  ArrowRight, BarChart3, Bell, Bot, Brain, Coins, DatabaseBackup, Gift, Globe,
  KeyRound, Layers, Lock, MessageSquare, MousePointerClick, ScrollText,
  Server, ShieldAlert, ShieldCheck, Sparkles, Star, Ticket, Timer, TrendingUp,
  Users, Workflow, Zap, Check, HeartHandshake, Rocket, LifeBuoy,
} from 'lucide-react';
import { PLAN_LIMITS, type PlanTier } from '@nexora/types';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { Reveal } from '@/components/marketing/reveal';
import { ProductPreview } from '@/components/marketing/product-preview';
import { AnalyticsDemo } from '@/components/marketing/analytics-demo';
import { Faq } from '@/components/marketing/faq-accordion';

export default function LandingPage() {
  return (
    <>
      <MarketingNavbar />
      <main id="main">
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pb-24 pt-32">
          <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden="true" />
          <div
            className="pointer-events-none absolute inset-0 bg-grid-slate [background-size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
            aria-hidden="true"
          />
          <div className="container relative text-center">
            <Reveal>
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                AI-assisted moderation and automation, built in
              </div>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Powerful Automation.
                <br />
                <span className="text-gradient">Smarter Communities.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Nexora is the all-in-one Discord platform for moderation, automation, analytics
                and engagement — wrapped in a dashboard your whole team will love.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="/api/invite"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary px-6 text-base font-semibold text-white shadow-[0_0_28px_-6px_rgba(88,101,242,0.8)] transition hover:opacity-90 focus-ring sm:w-auto"
                >
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  Add Nexora to Discord
                </a>
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-6 text-base font-medium backdrop-blur transition hover:bg-muted focus-ring sm:w-auto"
                >
                  Explore Dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-5 text-xs text-muted-foreground">
                Free forever for core features · No credit card required
              </p>
            </Reveal>
            <Reveal delay={0.25}>
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="container py-24">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your server needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              Twenty-plus modules, one bot. Configure it all from a single dashboard — no
              commands to memorize.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Smart Moderation', desc: 'Warnings, timeouts, bans, escalation ladders and case history with evidence.' },
              { icon: Bot, title: 'AutoMod', desc: '16 rule types — spam, phishing, invites, caps, NSFW and more, fully tunable.' },
              { icon: ShieldAlert, title: 'Anti-Raid', desc: 'Join-rate detection, quarantine, auto-lockdown and account-age filters.' },
              { icon: Workflow, title: 'Automations', desc: 'If-This-Then-That workflows: triggers, conditions and chained actions.' },
              { icon: MessageSquare, title: 'Welcome & Goodbye', desc: 'Embed builders with live Discord preview, DM welcome, auto-roles and cards.' },
              { icon: Ticket, title: 'Tickets', desc: 'Multi-type ticket panels, claiming, transcripts, ratings and inactivity close.' },
              { icon: TrendingUp, title: 'Leveling', desc: 'XP, cooldowns, role multipliers, role rewards and level-up announcements.' },
              { icon: Coins, title: 'Economy', desc: 'Currency, dailies, work and crime, plus a role-granting shop system.' },
              { icon: Gift, title: 'Giveaways', desc: 'Requirements, bonus entries, rerolls and scheduled end handled by the bot.' },
              { icon: MousePointerClick, title: 'Reaction Roles', desc: 'Button and dropdown role menus with single-choice and premium styling.' },
              { icon: ScrollText, title: 'Logging', desc: '19 log categories routed to the channels you choose, with ignore lists.' },
              { icon: Bell, title: 'Verification', desc: 'Button or captcha gates with verified roles, timeouts and kick-on-expiry.' },
              { icon: BarChart3, title: 'Analytics', desc: 'Member growth, activity, voice, moderation trends and command usage.' },
              { icon: DatabaseBackup, title: 'Backups', desc: 'Scheduled and on-demand backups with checksums, download and restore.' },
              { icon: Globe, title: 'Integrations', desc: 'Signed webhooks and developer API keys with a documented event catalog.' },
              { icon: Server, title: 'Core Commands', desc: 'A full slash-command registry plus your own custom commands with cooldowns.' },
            ].map((f, i) => (
              <Reveal key={f.title} delay={Math.min(i * 0.04, 0.3)}>
                <div className="group h-full rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============ MODERATION ============ */}
        <section id="moderation" className="border-y border-border bg-card/30 py-24">
          <div className="container grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Moderation that escalates intelligently
              </h2>
              <p className="mt-4 text-muted-foreground">
                Define an escalation ladder once — Nexora enforces it consistently. Every case is
                logged with evidence, appeals and a full per-user warning history.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Visual escalation editor: 3 warnings → timeout, 5 → kick, 7 → ban',
                  'Per-user warning history with points and expiry',
                  'Case evidence links and appeal tracking',
                  'Full audit trail of who did what, when',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="glass rounded-2xl p-5 shadow-xl">
                <p className="mb-4 text-sm font-semibold text-muted-foreground">Escalation ladder</p>
                <ol className="space-y-2.5">
                  {[
                    { n: 2, action: 'Timeout 1h', tone: 'bg-amber-500/15 text-amber-500' },
                    { n: 3, action: 'Timeout 7d', tone: 'bg-orange-500/15 text-orange-500' },
                    { n: 4, action: 'Kick', tone: 'bg-red-500/15 text-red-500' },
                    { n: 5, action: 'Temp-ban 30d', tone: 'bg-red-600/15 text-red-600' },
                  ].map((step) => (
                    <li key={step.n} className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${step.tone}`}>
                        {step.n}×
                      </span>
                      <span className="text-sm font-medium">{step.action}</span>
                      <span className="ml-auto text-xs text-muted-foreground">warning{step.n > 1 ? 's' : ''}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ AUTOMATION ============ */}
        <section id="automations" className="container py-24">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              If This, Then That — for your server
            </h2>
            <p className="mt-3 text-muted-foreground">
              Chain triggers to actions visually. No scripting, no commands — just pick, configure,
              done.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:gap-0">
              <div className="w-full max-w-xs rounded-2xl border-2 border-primary/40 bg-card p-5 text-center shadow-lg sm:w-56">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Trigger</p>
                <p className="mt-2 font-semibold">Member joins</p>
                <p className="mt-1 text-xs text-muted-foreground">Account older than 7 days</p>
              </div>
              <div className="flex items-center px-2 sm:px-4" aria-hidden="true">
                <ArrowRight className="h-6 w-6 rotate-90 text-primary sm:rotate-0" />
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-1">
                {[
                  { icon: MessageSquare, text: 'Send welcome embed in #welcome' },
                  { icon: Users, text: 'Add @Member role' },
                  { icon: Bell, text: 'Notify staff if raid score > 80' },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <a.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium">{a.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ============ ANALYTICS ============ */}
        <section id="analytics" className="border-y border-border bg-card/30 py-24">
          <div className="container">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Know your community
              </h2>
              <p className="mt-3 text-muted-foreground">
                Daily aggregates of members, messages, voice, tickets and moderation — up to two
                years on Enterprise.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <AnalyticsDemo />
            </Reveal>
          </div>
        </section>

        {/* ============ SECURITY ============ */}
        <section className="container py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <div className="glass rounded-2xl p-6 shadow-xl">
                <div className="space-y-4">
                  {[
                    { icon: Lock, title: 'Encrypted secrets', desc: 'Webhook signing secrets and API keys are hashed or encrypted at rest.' },
                    { icon: KeyRound, title: 'Scoped API keys', desc: 'Developer keys with per-scope grants, rate limits and one-time reveal.' },
                    { icon: Timer, title: 'HMAC-signed webhooks', desc: 'Every delivery is signed and retried with exponential backoff.' },
                  ].map((s) => (
                    <div key={s.title} className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <s.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{s.title}</p>
                        <p className="text-sm text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Security is not a feature — it&apos;s the foundation
              </h2>
              <p className="mt-4 text-muted-foreground">
                Nexora requests only the Discord scopes it needs and validates every dashboard
                action against your live Discord permissions. Everything is audit-logged.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ AI ============ */}
        <section className="border-y border-border bg-card/30 py-24">
          <div className="container grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                AI where it actually helps
              </h2>
              <p className="mt-4 text-muted-foreground">
                Premium plans unlock an AI assistant that drafts embeds, classifies tickets and
                summarizes raid context — never a replacement for your moderators, just a very
                fast intern.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'AI embed drafting from a plain-language description',
                  'Automatic ticket triage and priority suggestions',
                  'Raid summaries: what happened, who was hit, what was done',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Brain className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="glass rounded-2xl p-5 shadow-xl">
                <p className="mb-3 text-sm font-semibold text-muted-foreground">AI ticket triage</p>
                <div className="rounded-xl border border-border bg-card/70 p-4">
                  <p className="text-sm italic text-muted-foreground">
                    “I can&apos;t access the #premium channel even though I paid two days ago”
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">Billing</span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-500">Priority: HIGH</span>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-500">Suggested: assign @Billing team</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ INTEGRATIONS ============ */}
        <section className="container py-24">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built to integrate</h2>
            <p className="mt-3 text-muted-foreground">
              Real-time webhooks, a documented REST API, and scheduled jobs the bot executes for
              you.
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: Globe, label: 'Webhooks' },
                { icon: Layers, label: 'REST API' },
                { icon: Workflow, label: 'Scheduled jobs' },
                { icon: DatabaseBackup, label: 'Backups' },
              ].map((i) => (
                <div key={i.label} className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
                  <i.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <p className="text-sm font-medium">{i.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ============ PRICING ============ */}
        <section id="pricing" className="border-y border-border bg-card/30 py-24">
          <div className="container">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pricing that scales with you</h2>
              <p className="mt-3 text-muted-foreground">
                Start free. Upgrade when your community outgrows the limits.
              </p>
            </Reveal>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(PLAN_LIMITS) as PlanTier[]).map((tier, i) => {
                const limits = PLAN_LIMITS[tier];
                const highlight = tier === 'PRO';
                const features = [
                  `${limits.automations} automations`,
                  `${limits.customCommands} custom commands`,
                  `${limits.autoModRules} AutoMod rules`,
                  `${limits.backups} backups`,
                  `${limits.analyticsRetentionDays}-day analytics`,
                  ...(limits.ai ? ['AI assistant & triage'] : []),
                  ...(limits.welcomeCards ? ['Welcome image cards'] : []),
                  ...(tier === 'ENTERPRISE' ? ['Priority support & SLA', 'Dedicated shard'] : []),
                ];
                return (
                  <Reveal key={tier} delay={i * 0.05}>
                    <div
                      className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                        highlight
                          ? 'border-primary/60 bg-card shadow-[0_0_36px_-12px_rgba(88,101,242,0.6)]'
                          : 'border-border bg-card'
                      }`}
                    >
                      {highlight && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-0.5 text-xs font-semibold text-white">
                          Most popular
                        </span>
                      )}
                      <h3 className="font-semibold uppercase tracking-wide">{tier}</h3>
                      <p className="mt-3">
                        <span className="text-3xl font-extrabold">
                          {tier === 'FREE' ? '$0' : tier === 'PRO' ? '$7' : tier === 'BUSINESS' ? '$19' : 'Custom'}
                        </span>
                        {tier !== 'ENTERPRISE' && (
                          <span className="text-sm text-muted-foreground"> /mo</span>
                        )}
                      </p>
                      <ul className="mt-5 flex-1 space-y-2.5">
                        {features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6">
                        {tier === 'ENTERPRISE' ? (
                          <a
                            href="mailto:sales@nexora.dev"
                            className="block rounded-lg border border-border px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-muted focus-ring"
                          >
                            Contact sales
                          </a>
                        ) : (
                          <Link
                            href="/dashboard"
                            className={`block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition focus-ring ${
                              highlight
                                ? 'bg-gradient-primary text-white hover:opacity-90'
                                : 'border border-border hover:bg-muted'
                            }`}
                          >
                            {tier === 'FREE' ? 'Start free' : 'Get started'}
                          </Link>
                        )}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ TESTIMONIALS ============ */}
        <section className="container py-24">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Loved by communities</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  'We replaced four different bots with Nexora. The escalation ladder alone saved our mod team hours every week.',
                name: 'Aurora Voss',
                role: 'Admin, Nebula Gaming · 84k members',
                icon: Rocket,
              },
              {
                quote:
                  'The anti-raid quarantined a 400-account attack at 3am while we slept. Woke up to a clean summary, not a wrecked server.',
                name: 'Dex Moreau',
                role: 'Owner, Synthwave Club · 21k members',
                icon: HeartHandshake,
              },
              {
                quote:
                  'Ticket transcripts, ratings and analytics in one place — our support SLA went from “whenever” to same-day.',
                name: 'Priya Raghavan',
                role: 'Community Lead, DevLounge · 45k members',
                icon: LifeBuoy,
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 0.07}>
                <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="mt-4 flex-1 text-sm text-muted-foreground">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                      <t.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="container py-24">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Faq
              items={[
                {
                  question: 'Is Nexora really free?',
                  answer:
                    'Yes — the free plan includes core moderation, AutoMod (5 rules), 3 automations, tickets, leveling and 7-day analytics, with no paywalled essentials. Premium unlocks higher limits and AI features.',
                },
                {
                  question: 'How do I manage my server\'s settings?',
                  answer:
                    'Sign in with Discord and open the dashboard. You need the Manage Server permission on a server (and Nexora must be a member) to configure it.',
                },
                {
                  question: 'What happens to my settings if the bot goes offline?',
                  answer:
                    'All configuration lives in a PostgreSQL database, not memory. When the bot reconnects it picks up exactly where it left off, and scheduled jobs are queued durably.',
                },
                {
                  question: 'Can I export or back up my configuration?',
                  answer:
                    'Yes — the Backups module creates full configuration snapshots you can download as JSON and restore at any time (with confirmation). Scheduled backups are available on paid plans.',
                },
                {
                  question: 'Does Nexora support slash commands?',
                  answer:
                    'Nexora registers its full command registry as slash commands when invited with the applications.commands scope, and you can build your own custom commands in the dashboard.',
                },
                {
                  question: 'How does the AI moderation work?',
                  answer:
                    'AI features are opt-in and assistive: they classify tickets, summarize raids and draft embeds. Punitive actions always come from your configured rules, not the model.',
                },
              ]}
            />
          </Reveal>
        </section>

        {/* ============ CTA BANNER ============ */}
        <section className="container pb-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-[#5865F2]/15 via-transparent to-[#8B5CF6]/15 p-10 text-center sm:p-16">
              <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" aria-hidden="true" />
              <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
                Ready for a smarter community?
              </h2>
              <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
                Add Nexora in under a minute. Free forever for core features.
              </p>
              <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="/api/invite"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary px-6 font-semibold text-white shadow-lg transition hover:opacity-90 focus-ring sm:w-auto"
                >
                  Add Nexora to Discord <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-card/60 px-6 font-medium backdrop-blur transition hover:bg-muted focus-ring sm:w-auto"
                >
                  Open the dashboard
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-border py-14">
      <div className="container">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="text-lg font-bold tracking-tight">NEXORA</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Powerful Automation. Smarter Communities.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </div>
          </div>
          {[
            { title: 'Product', links: [['Features', '/#features'], ['Pricing', '/#pricing'], ['Dashboard', '/dashboard'], ['Status', '/#faq']] },
            { title: 'Resources', links: [['Documentation', '/#faq'], ['API reference', '/#faq'], ['FAQ', '/#faq'], ['Changelog', '/#faq']] },
            { title: 'Legal', links: [['Terms of Service', '/#faq'], ['Privacy Policy', '/#faq'], ['Refund Policy', '/#faq'], ['Contact', 'mailto:hello@nexora.dev']] },
          ].map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Nexora. All rights reserved.</p>
          <p>Not affiliated with Discord Inc.</p>
        </div>
      </div>
    </footer>
  );
}
