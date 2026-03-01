import { memo } from "react";
import { ShoppingCart, ChevronLeft, ChevronRight, X } from "lucide-react";

interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  stock: number;
  program_id: string | null;
  payment_url: string | null;
}

interface Props {
  products: ShopProduct[];
  productIndex: number;
  setProductIndex: (fn: (i: number) => number) => void;
  onClose: () => void;
  variant: "popup" | "panel";
}

function PlayerShopProduct({ products, productIndex, setProductIndex, onClose, variant }: Props) {
  if (products.length === 0) {
    if (variant === "panel") {
      return <p className="text-white/40 text-sm text-center py-4">Nenhum produto disponível neste momento.</p>;
    }
    return null;
  }

  const idx = Math.min(productIndex, products.length - 1);
  const p = products[idx];
  if (!p) return null;

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#e60000" }}>
          <ShoppingCart size={12} className="inline mr-1" />
          {variant === "popup" ? "Oferta ao vivo" : "Produtos ao Vivo"}
          {products.length > 1 && (
            <span className="ml-1 text-white/40">({idx + 1}/{products.length})</span>
          )}
        </span>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          <X size={14} />
        </button>
      </div>

      {/* Navigation arrows */}
      {products.length > 1 && (
        <>
          <button
            onClick={() => setProductIndex(i => (i - 1 + products.length) % products.length)}
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setProductIndex(i => (i + 1) % products.length)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}

      <div className="flex gap-3 items-center">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-20 h-20 rounded-lg object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-white/10 flex items-center justify-center">
            <ShoppingCart size={20} className="text-white/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-bold truncate">{p.name}</div>
          <div className="text-lg font-bold" style={{ color: "#e60000" }}>
            R$ {Number(p.price).toFixed(2)}
          </div>
          <div className="text-white/40 text-[10px]">{p.stock} disponíveis</div>
        </div>
      </div>
      {p.description && <p className="text-white/60 text-xs mt-2 line-clamp-2">{p.description}</p>}
      {p.payment_url ? (
        <a
          href={p.payment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-3 py-2.5 rounded-lg text-sm font-bold text-white text-center transition-all hover:brightness-110"
          style={{ backgroundColor: "#009ee3" }}
        >
          💳 Comprar via Mercado Pago
        </a>
      ) : (
        <button
          className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
          style={{ backgroundColor: "#e60000" }}
        >
          Ver Produto
        </button>
      )}
    </div>
  );
}

export default memo(PlayerShopProduct);
