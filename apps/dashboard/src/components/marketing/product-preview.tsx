'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, ShieldCheck, Zap, Users, MessageSquare, Bot } from 'lucide-react';

/**
 * Pure CSS/JSX product preview: a floating "dashboard card" next to a Discord
 * chat mock. No screenshots — everything is real markup.
 */
export function ProductPreview() {
  const reduced = useReducedMotion();
  const float = (delay: number) =>
    reduced ? {} : { animate: { y: [0, -10, 0] }, transition: { duration: 6, repeat: Infinity, delay, ease: 'easeInOut' as const } };

  return (
    <div className="relative mx-auto mt-16 max-w-4xl" aria-hidden="true">
      {/* Dashboard card */}
      <motion.div
        {...float(0)}
        className="glass relative z-10 ml-auto w-[88%] rounded-2xl p-4 shadow-2xl sm:w-[62%]"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Overview
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Users, label: 'Members', value: '12,480' },
            { icon: MessageSquare, label: 'Messages 7d', value: '89.2K' },
            { icon: ShieldCheck, label: 'Mod actions', value: '142' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-muted/60 p-2.5">
              <s.icon className="h-3.5 w-3.5 text-primary" />
              <p className="mt-1.5 text-sm font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        {/* Mini bar chart */}
        <div className="mt-3 flex h-20 items-end gap-1.5 rounded-xl bg-muted/40 p-3">
          {[35, 55, 40, 70, 52, 85, 64, 92, 78, 60, 88, 96].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-[#5865F2] to-[#8B5CF6]"
              style={{ height: `${h}%`, opacity: 0.45 + (i / 12) * 0.55 }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-medium text-emerald-500">Bot online · 99.98% uptime</p>
        </div>
      </motion.div>

      {/* Discord chat mock */}
      <motion.div
        {...float(1.5)}
        className="glass relative z-20 -mt-16 w-[90%] rounded-2xl p-4 shadow-2xl sm:-mt-24 sm:w-[55%]"
      >
        <div className="mb-3 flex items-center gap-2 border-b border-white/5 pb-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#5865F2] to-[#8B5CF6] text-[10px] font-bold text-white">
            N
          </span>
          <span className="text-xs font-semibold text-white/90">Nexora</span>
          <span className="rounded bg-[#5865F2] px-1 py-px text-[9px] font-semibold uppercase text-white">
            Bot
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="rounded-lg rounded-tl-none bg-muted/70 px-2.5 py-1.5 text-[11px] text-white/80">
              <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" />
              Raid defused — 23 suspicious joins quarantined.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div
              className="rounded-lg rounded-tl-none bg-muted/70 px-2.5 py-2"
              style={{ borderLeft: '3px solid #5865F2' }}
            >
              <p className="text-[11px] font-semibold text-white/90">Welcome, @Aurora!</p>
              <p className="text-[11px] text-white/60">
                You are member #12,481 — enjoy your stay in Nexora Community.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="rounded-lg rounded-tl-none bg-muted/70 px-2.5 py-1.5 text-[11px] text-white/80">
              AutoMod removed a phishing link in #general.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
