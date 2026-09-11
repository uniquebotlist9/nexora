'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface PlanSlice {
  plan: string;
  count: number;
}

const PLAN_COLORS: Record<string, string> = {
  FREE: '#52525b',
  PRO: '#6370f2',
  BUSINESS: '#a78bfa',
  ENTERPRISE: '#34d399',
};

interface PlanPieChartProps {
  data: PlanSlice[];
}

/** Active subscription distribution across plan tiers. */
export function PlanPieChart({ data }: PlanPieChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        No active subscriptions.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="plan"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice) => (
              <Cell
                key={slice.plan}
                fill={PLAN_COLORS[slice.plan] ?? '#52525b'}
              />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            formatter={(value: string) => (
              <span style={{ color: 'hsl(240 5% 65%)', fontSize: 12 }}>{value}</span>
            )}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 5% 8%)',
              border: '1px solid hsl(240 4% 16%)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number | string) => [value, 'Subscriptions']}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
