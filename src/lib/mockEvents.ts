export type Event = {
  id: string;
  title: string;
  date: string;
};

const sampleTitles = [
  'Team Sync',
  'Doctor Appointment',
  'Weekly Review',
  'Lunch with Sam',
  '1:1 with Manager',
  'Refactor Session',
];

function randomTitle() {
  return sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
}

function randomDate() {
  const now = new Date();
  const future = new Date(now.getTime() + Math.random() * 7 * 86400000);
  return future.toISOString().slice(0, 10);
}

export function fetchMockEvents(): Promise<Event[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        Array.from({ length: 5 }).map(() => ({
          id: crypto.randomUUID(),
          title: randomTitle(),
          date: randomDate(),
        })),
      );
    }, 1200);
  });
}
