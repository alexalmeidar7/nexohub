import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, styles, modifiersStyles, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: "h-7 w-7 rounded-full bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-muted border-0 flex items-center justify-center transition-colors",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: "h-9 w-9 rounded-md p-0 font-normal aria-selected:opacity-100 hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground transition-colors",
        day_range_end: "day-range-end",
        day_selected: "text-primary-foreground hover:text-primary-foreground focus:text-primary-foreground",
        day_today: "font-semibold",
        day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      styles={styles}
      modifiersStyles={{
        selected: {
          backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))",
          color: "var(--layout-header-text, hsl(var(--primary-foreground)))",
        },
        today: {
          backgroundColor: "#C6F03C !important",
          color: "#0A2540 !important",
          fontWeight: 800,
        },
        range_middle: {
          backgroundColor: "color-mix(in srgb, var(--layout-accent-color, hsl(var(--primary))) 12%, var(--layout-page-bg, hsl(var(--background))) 88%)",
          color: "var(--layout-page-text, hsl(var(--foreground)))",
        },
        ...modifiersStyles,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
