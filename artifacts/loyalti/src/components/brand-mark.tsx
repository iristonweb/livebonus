import { cn } from "@/lib/utils";

export function BrandMark({ 
  className, 
  type = "currentColor" 
}: { 
  className?: string;
  type?: "primary" | "white" | "currentColor";
}) {
  const fillClass = type === "primary" ? "fill-primary" : type === "white" ? "fill-white" : "fill-current";
  
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" className={cn(fillClass, className)}>
      <path d="m75 83.3-16.5-17.8-9.3 8.9 25.8 27.5 51.7-55.5v-16.9l-51.7 53.8z"/>
      <path d="m113.8 70.2v11.6c0 17.2-19.1 35.7-38.7 46.2-18.7-9.3-38.7-27.5-38.7-46.2v-13.5l19.9-14.5 18.7 20.5 8.4-9.2-25.5-27.7-21.6 15.1v-13.5l38.7-17.5 34.1 15.5 9.4-9.8-43.5-19.7-51.7 23.3v50.5c0 22.6 19.7 45.6 51.7 61.2 21.2-9.3 51.6-30.5 51.7-60.1v-26.1l-12.9 13.9z"/>
    </svg>
  );
}
