import { cn } from "@/lib/utils";

export function EmptySearch({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92" className={className}>
      <path className="fill-muted-foreground opacity-40" d="m7 50.7c-0.6 0.5-1 1.2-1 2.2v1.8c-0.1 1.6 1.3 2.9 2.8 2.9h4.2l-2-2.3c-1.2-1.3-2.3-3-3.6-5.1l-0.4 0.5z"/>
      <path className="fill-muted-foreground opacity-40" d="m57.2 65 0.7-0.8h-2.1c-4.4 2.2-9.6 3.9-16.5 3.9-5 0-10.7-1-16.9-3.9h-13.5c-1.6 0-2.9 1.2-2.9 2.9v2.7c0 1.6 1.3 3.4 3.4 3.4h55.5l-7.7-8.2z"/>
      <path className="fill-muted-foreground opacity-40" d="m50.7 79.8h-41.9c-1.5 0-2.9 1.2-2.9 3.1v4c0 1.6 1.3 2.9 2.9 2.9h41.9c1.7 0 2.9-1.3 2.9-2.9v-3.8c0.1-1.6-1.1-3.3-2.9-3.3z"/>
      <path className="fill-muted-foreground opacity-40" d="m91.3 5h-32.9c4.7 2.6 8 6.2 10.4 9.7h22.5c1.4 0 2.7-1.1 2.7-2.7v-4.1c0.1-1.6-1.2-2.9-2.7-2.9z"/>
      <path className="fill-muted-foreground opacity-40" d="m91.1 20.3h-19.2c0.9 2.1 1.9 4.8 2.4 7.1h16.8c1.5 0 2.9-1.2 3-2.8v-1.5c-0.1-1.5-1.3-2.8-3-2.8z"/>
      <path className="fill-muted-foreground opacity-40" d="m82.2 37.4c0-1.4-0.9-3.1-3-3.1h-4.3c0 2.6-0.4 5.5-1.4 8.9h5.7c1.7 0 3-1.2 3-2.9v-2.9z"/>
      <path className="fill-muted-foreground opacity-40" d="m91.1 49.7h-20.3c-0.8 1.6-2 3.5-3.3 4.9l2-2 4.9 5h16.7c1.4 0 2.9-1.2 2.9-2.8v-1.9c0-1.7-1.3-3.2-2.9-3.2z"/>
      <path className="fill-muted-foreground opacity-40" d="m91.1 64.2h-10.4l8.9 9h1.4c1.6 0 3-1.2 3-2.9v-2.9c0-1.7-1.3-3.2-2.9-3.2z"/>
      <path className="fill-muted-foreground opacity-40" d="m54 17h-30.1c-2.7 2.1-5.4 5.5-7 9.4h44.1c-1.3-3.3-4-7.1-7-9.4z"/>
      <path className="fill-muted-foreground opacity-40" d="m15.7 34.3c0 3.1 0.8 6 2.1 8.9h42.2c1.2-2.4 2.1-5.6 2.1-8.9h-46.4z"/>
      <path className="fill-muted-foreground opacity-40" d="m22.6 49.7c2.8 2.9 8 6.5 16.7 6.5 5.1 0 11.2-1.7 15.9-6.2v-0.3h-32.6z"/>
      <path className="fill-primary" d="m92.7 81.3-23.4-24.3-1.5 1.5-4-3.9c5.5-5.7 8.3-13.3 8.2-21.5-0.3-13.7-11.3-28.9-28-30.8-3-0.3-6-0.3-8.5-0.1-14.6 1.5-27.5 12.7-29.5 26.9-0.3 2.6-0.3 5.3 0 8 2.4 15.5 14.6 27.8 33.5 28.5 5.5 0 13.1-1.4 19.7-6.9l4.1 4.2-1.6 1.6 23.3 24c1.8 1.7 5 2 7.2 0.3 2.3-1.8 2.3-5.3 0.5-7.5zm-53.6-22.6c-14.9 0-26.1-11.7-26.1-25 0-12.9 11-24.8 26.1-24.8 13.4 0 25.8 10 25.8 25.1-0.1 11.6-9.4 24.7-25.8 24.7z" />
    </svg>
  );
}

export function EmptyList({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" className={className}>
      <polygon className="fill-primary" points="22.3 79.6 45.4 142.7 111.3 120.9 127.8 81.9 106 88.9 106 74.9 95.4 79.3 93.1 72.8 93.3 72.7 116.9 57.8 108.7 52.6 114.8 49.7 124.2 23.7 86.3 41.3 48.6 19.2 38.8 25.5 25.6 33.9 43.5 43.9 30.7 52.4 65 73.2 53.7 76.8 45.5 72.1"/>
      <path className="fill-muted-foreground opacity-50" d="m38.8 25.5-13.2 8.4 39.6 23.7 1.9 1.1 11.3-10.2-39.6-23z"/>
      <path className="fill-muted-foreground opacity-30" d="m86.3 41.3-37.7-22.1-4.4 2.8 39.5 23-2.2 1.3 4.9 3.3-20.5 14.4-27.3-17-7.9 5.4 48.1 28.8 14.5-8.5 23.6-14.8-40.5 15.4-5.2-2.4 43.6-21.2 9.4-26-37.9 17.6z"/>
      <path className="fill-muted-foreground opacity-30" d="m80 86.1-25.2 8.1-5.4 22.5v-25.8l23.2-7.7-5.9-3.5-31.9 10.3 12.1 37.6-1.8 14.9 16.7-38.7 44.2-14.9v-14l-26 11.2z"/>
      <path className="fill-primary" d="m86.9 7.5-2.9 8.7-9 2.7 8.9 2.7 3 9.1 2.9-9 9.2-2.8-9.2-2.7-2.9-8.7z"/>
    </svg>
  );
}
