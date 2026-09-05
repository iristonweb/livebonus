import { Link } from "wouter";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-md w-full trust-panel p-10 text-center shadow-2xl"
      >
        <div className="w-20 h-20 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mx-auto mb-8 shadow-inner">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        </div>
        
        <h1 className="text-4xl font-bold text-foreground tracking-tight mb-3">404</h1>
        <p className="text-lg text-muted-foreground font-semibold mb-10">
          Запрашиваемая страница не найдена или была удалена.
        </p>

        <Link href="/">
          <button className="w-full py-4 rounded-xl bg-foreground text-background font-bold text-base hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-foreground/20">
            <ArrowLeft className="w-5 h-5" /> Вернуться на главную
          </button>
        </Link>
      </motion.div>
    </div>
  );
}
