import { useState } from "react";

import { Calendar as SharedCalendar } from "@/components/ui/calendar";

const previewMonth = new Date(2026, 7, 1);

export function Calendar() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(2026, 7, 15),
  );

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto w-fit space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Select a date to verify the shared calendar preview.
          </p>
        </div>
        <SharedCalendar
          data-testid="calendar-preview"
          defaultMonth={previewMonth}
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          animate
        />
      </div>
    </main>
  );
}