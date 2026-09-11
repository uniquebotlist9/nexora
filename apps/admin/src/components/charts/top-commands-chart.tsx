'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CommandUsage {
  name: string;
  uses: number;
}

interface TopCommandsChartProps {
  data: CommandUsage[];
}

/** Top commands by total uses (CommandStat), horizontal bars. */
export function TopCommandsChart({ data }: TopCommandsChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 14%)" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: 'hsl(240 5% 60%)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: 'hsl(240 5% 65%)', fontSize: 11 }}
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
            cursor={{ fill: 'hsl(240 4% 12% / 0.5)' }}
            formatter={(value: number | string) => [value, 'Uses']}
          />
          <Bar dataKey="uses" fill="#6370f2" radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
