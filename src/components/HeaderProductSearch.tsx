import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { availableSpecialtyProducts } from '@/lib/specialtyProducts';

const products = [
  { name: 'Custom Vinyl Banners', url: '/design?product=banner', image: '/images/campaign/vinyl-banners-640.webp' },
  { name: 'Custom Yard Signs', url: '/design?product=yard-signs', image: '/images/campaign/yard-signs-640.webp' },
  { name: 'Custom Car Magnets', url: '/design?product=car-magnets', image: '/images/campaign/car-magnets-640.webp' },
  ...availableSpecialtyProducts.map(product => ({ name: product.name, url: `/products/${product.slug}`, image: product.image })),
];
export default function HeaderProductSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = products.filter(product => product.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button type="button" className="bof-search-trigger" aria-label="Search products"><Search aria-hidden="true" /></button></DialogTrigger>
      <DialogContent className="bof-search-dialog">
        <DialogTitle className="bof-search-title">Find your next big thing.</DialogTitle>
        <DialogDescription>Search banners, signs, flags and displays.</DialogDescription>
        <label className="sr-only" htmlFor="bof-product-search">Search products</label>
        <input id="bof-product-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="What are you looking for?" className="brand-field" />
        <p role="status" className="text-xs text-slate-500">{results.length} products</p>
        <div className="bof-search-results">
          {results.map(product => <Link key={product.url} to={product.url} onClick={() => setOpen(false)}><img src={product.image} alt="" width="72" height="48" loading="lazy" /><span>{product.name}</span><ArrowRight aria-hidden="true" /></Link>)}
          {!results.length && <p className="py-6 text-slate-600">No products found. Try “banner”, “sign” or “flag”.</p>}
        </div>
      </DialogContent>
    </Dialog>;
}
