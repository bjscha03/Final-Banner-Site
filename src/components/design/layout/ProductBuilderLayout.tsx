import React from 'react';

interface ProductBuilderLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

const ProductBuilderLayout: React.FC<ProductBuilderLayoutProps> = ({ left, right }) => {
  return (
    <div className="grid gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(380px,1fr)]">
      <div className="min-w-0">{left}</div>
      <aside className="min-w-0 lg:sticky lg:top-[100px] self-start">{right}</aside>
    </div>
  );
};

export default ProductBuilderLayout;
