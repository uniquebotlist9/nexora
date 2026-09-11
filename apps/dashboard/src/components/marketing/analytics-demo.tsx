'use client';

import * as React from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const data = [
  { day: 'Mon', messages: 2400, members: 10240, active: 1800 },
  { day: 'Tue', messages: 3100, members: 10310, active: 2100 },
  { day: 'Wed', messages: 2800, members: 10420, active: 1950 },
  { day: 'Thu', messages: 3600, members: 10580, active: 2400 },
  { day: 'Fri', messages: 4200, members: 10760, active: 2800 },
  { day: 'Sat', messages: 5100, members: 11020, active: 3400 },
  { day: 'Sun', messages: 4700, members: 11240, active: 3100 },
];

/** Static mini analytics demo for the landing page (client component). */
export function AnalyticsDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Messages per day</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5865F2" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#5865F2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(245 25% 6%)',
                  border: '1px solid hsl(245 15% 15%)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(225 20% 94%)',
                }}
              />
              <Area type="monotone" dataKey="messages" stroke="#5865F2" strokeWidth={2} fill="url(#msgGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Member growth</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" tickLine={false} axisLine={false} domain={['dataMin - 200', 'dataMax + 100']} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(245 25% 6%)',
                  border: '1px solid hsl(245 15% 15%)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(225 20% 94%)',
                }}
              />
              <Bar dataKey="members" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
