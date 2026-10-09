import { useEffect, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

// Register only what the app uses to keep the bundle small.
echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

export interface ChartTheme {
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  series: [string, string, string, string];
  accent: string;
}

function readTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--${n}`).trim();
  return {
    ink: v("ink"),
    ink2: v("ink-2"),
    muted: v("muted"),
    grid: v("grid"),
    axis: v("axis"),
    surface: v("surface"),
    series: [v("series-1"), v("series-2"), v("series-3"), v("series-4")],
    accent: v("accent"),
  };
}

/** Re-reads tokens when the OS colour scheme flips, so charts follow light/dark. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setTheme(readTheme());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return theme;
}

/** Shared recessive chrome: hairline grid, muted axis labels, tooltip on surface. */
export function baseOption(t: ChartTheme): EChartsOption {
  return {
    animation: false,
    textStyle: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: t.ink2 },
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: "box-shadow: 0 2px 8px rgba(0,0,0,.12); border-radius: 8px;",
    },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 12 } },
  };
}

export function axisStyle(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: t.grid } },
  };
}

export function Chart({ option, height = 260 }: { option: EChartsOption; height?: number }) {
  return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height, width: "100%" }} opts={{ renderer: "svg" }} />;
}
