import Link from "next/link";

const categories = ["Mirrors", "Furniture", "Decor"];

const featuredProducts = [
  {
    name: "Aria Arch Mirror",
    category: "Mirrors",
    price: "Rs. 12,900",
    compareAt: "Rs. 15,500",
    status: "In stock",
  },
  {
    name: "Linea Console Table",
    category: "Furniture",
    price: "Rs. 18,400",
    compareAt: "Rs. 21,000",
    status: "Limited stock",
  },
  {
    name: "Noor Brass Wall Accent",
    category: "Decor",
    price: "Rs. 4,800",
    compareAt: "Rs. 5,600",
    status: "In stock",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f4ef] text-[#1f2933]">
      <header className="border-b border-[#d8d2c8] bg-[#fffdf8]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-5 sm:px-8">
          <Link href="/" className="text-2xl font-semibold tracking-wide">
            Vooye
          </Link>
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 text-sm font-medium text-[#52606d] md:flex"
          >
            {categories.map((category) => (
              <Link key={category} href={`/categories/${category.toLowerCase()}`}>
                {category}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm font-medium">
            <Link href="/search" className="hidden sm:inline">
              Search
            </Link>
            <Link
              href="/cart"
              className="rounded-full bg-[#1f2933] px-4 py-2 text-[#fffdf8]"
            >
              Cart
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div className="flex flex-col justify-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7c6f5f]">
            Premium home details
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-[#111827] sm:text-6xl">
            Mirrors, furniture, and decor chosen for calm modern homes.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#52606d]">
            Vooye brings category-ready commerce to curated home pieces, from
            statement mirrors to adaptable furniture and finishing accents.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/categories/mirrors"
              className="rounded-full bg-[#1f2933] px-6 py-3 text-sm font-semibold text-white"
            >
              Shop mirrors
            </Link>
            <Link
              href="/categories/decor"
              className="rounded-full border border-[#9f927f] px-6 py-3 text-sm font-semibold text-[#1f2933]"
            >
              Explore decor
            </Link>
          </div>
        </div>

        <div className="grid min-h-[480px] grid-cols-6 grid-rows-6 gap-4">
          <div className="col-span-4 row-span-6 rounded-[2rem] bg-[#ddd4c7] p-5 shadow-sm">
            <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-[#b8ab99] bg-[#f5efe6]">
              <div className="h-[78%] w-[62%] rounded-t-full border-[14px] border-[#8f826f] bg-[#fffdf8] shadow-inner" />
            </div>
          </div>
          <div className="col-span-2 row-span-3 rounded-[1.5rem] bg-[#263238] p-5 text-white">
            <p className="text-sm text-[#c7d2d9]">Featured</p>
            <p className="mt-3 text-2xl font-semibold">Aria Arch Mirror</p>
            <p className="mt-4 text-sm text-[#dfe7eb]">Rs. 12,900</p>
          </div>
          <div className="col-span-2 row-span-3 rounded-[1.5rem] bg-[#a67f5b] p-5 text-white">
            <p className="text-sm text-[#f5e7d7]">New arrival</p>
            <p className="mt-3 text-2xl font-semibold">Noor Wall Accent</p>
          </div>
        </div>
      </section>

      <section className="border-y border-[#d8d2c8] bg-[#fffdf8]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c6f5f]">
                Featured products
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-[#111827]">
                Ready for the first catalog
              </h2>
            </div>
            <Link href="/products" className="text-sm font-semibold text-[#1f2933]">
              View all products
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {featuredProducts.map((product) => (
              <article
                key={product.name}
                className="rounded-lg border border-[#ded6ca] bg-white p-4"
              >
                <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-[#ede7dd]">
                  <div className="h-24 w-24 rounded-full border-[10px] border-[#9f927f] bg-[#fffdf8]" />
                </div>
                <div className="mt-5">
                  <p className="text-sm text-[#7c6f5f]">{product.category}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#111827]">
                    {product.name}
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <p className="font-semibold">{product.price}</p>
                    <p className="text-sm text-[#7c6f5f] line-through">
                      {product.compareAt}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-[#52606d]">{product.status}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#1f2933] px-5 py-8 text-[#f7f4ef] sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm sm:flex-row">
          <p>Vooye</p>
          <p>Mirrors, furniture, decor, and future home categories.</p>
        </div>
      </footer>
    </main>
  );
}
