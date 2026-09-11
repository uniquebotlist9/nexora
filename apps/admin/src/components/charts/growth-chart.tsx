'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface GrowthPoint {
  month: string;
  count: number;
}

interface GrowthChartProps {
  data: GrowthPoint[];
}

/** New guilds per month (from Guild.createdAt). */
export function GrowthChart({ data }: GrowthChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6370f2" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#6370f2" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 14%)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: 'hsl(240 5% 60%)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'hsl(240 5% 60%)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 5% 8%)',
              border: '1px solid hsl(240 4% 16%)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'hsl(240 5% 85%)' }}
            formatter={(value: number | string) => [value, 'New guilds']}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#7a86ff"
            strokeWidth={2}
            fill="url(#growthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
