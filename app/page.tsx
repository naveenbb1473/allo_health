import { redirect } from 'next/navigation'

/**
 * Root route → redirect to /products
 */
export default function Home() {
  redirect('/products')
}
