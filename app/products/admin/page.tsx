'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapPin, Plus, Edit, Image, Layers, Package, Trash2, ArrowLeft, X, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface Warehouse {
  id: string
  name: string
  location: string
}

interface WarehouseStock {
  warehouseId: string
  total: number
  reserved: number
  available: number
}

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  warehouses: WarehouseStock[]
}

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal controllers
  const [activeTab, setActiveTab] = useState<'products' | 'warehouses'>('products')
  const [showProductModal, setShowProductModal] = useState(false)
  const [showWarehouseModal, setShowWarehouseModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Product Form states
  const [prodName, setProdName] = useState('')
  const [prodDesc, setProdDesc] = useState('')
  const [prodPrice, setProdPrice] = useState('')
  const [prodImageUrl, setProdImageUrl] = useState('')
  const [prodStock, setProdStock] = useState<Record<string, number>>({}) // warehouseId -> quantity

  // Warehouse Form states
  const [whName, setWhName] = useState('')
  const [whLocation, setWhLocation] = useState('')

  const [submitting, setSubmitting] = useState(false)

  // ── Fetch inventories ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [whRes, prodRes] = await Promise.all([
        fetch('/api/warehouses'),
        fetch('/api/products'),
      ])

      if (!whRes.ok) throw new Error('Failed to fetch warehouses')
      if (!prodRes.ok) throw new Error('Failed to fetch products')

      const [warehouseData, productsData] = await Promise.all([
        whRes.json() as Promise<Warehouse[]>,
        prodRes.json() as Promise<Product[]>,
      ])

      setWarehouses(warehouseData)
      setProducts(productsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while loading data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // ── Reset Product Form ─────────────────────────────────────────────────────
  const resetProductForm = useCallback((product: Product | null = null) => {
    if (product) {
      setProdName(product.name)
      setProdDesc(product.description || '')
      setProdPrice(product.price.toString())
      setProdImageUrl(product.imageUrl || '')
      
      const stockMap: Record<string, number> = {}
      product.warehouses.forEach((w) => {
        stockMap[w.warehouseId] = w.total
      })
      setProdStock(stockMap)
    } else {
      setProdName('')
      setProdDesc('')
      setProdPrice('')
      setProdImageUrl('')
      
      const stockMap: Record<string, number> = {}
      warehouses.forEach((w) => {
        stockMap[w.id] = 0
      })
      setProdStock(stockMap)
    }
  }, [warehouses])

  // ── Open Create Product ────────────────────────────────────────────────────
  function handleOpenCreate() {
    setEditingProduct(null)
    resetProductForm(null)
    setShowProductModal(true)
  }

  // ── Open Edit Product ──────────────────────────────────────────────────────
  function handleOpenEdit(product: Product) {
    setEditingProduct(product)
    resetProductForm(product)
    setShowProductModal(true)
  }

  // ── Submit Product Form ────────────────────────────────────────────────────
  async function handleProductSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prodName || !prodPrice) {
      toast.error('Missing fields', { description: 'Please fill in Name and Price.' })
      return
    }

    setSubmitting(true)
    try {
      const url = editingProduct ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products'
      const method = editingProduct ? 'PATCH' : 'POST'
      
      const payload = editingProduct 
        ? {
            name: prodName,
            description: prodDesc,
            price: parseFloat(prodPrice),
            imageUrl: prodImageUrl || null,
            stockUpdates: prodStock,
          }
        : {
            name: prodName,
            description: prodDesc,
            price: parseFloat(prodPrice),
            imageUrl: prodImageUrl || null,
            initialStock: prodStock,
          }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(editingProduct ? 'Product updated!' : 'Product created successfully!')
        setShowProductModal(false)
        void fetchData()
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error('Action failed', { description: errData.error || 'Please review your inputs.' })
      }
    } catch {
      toast.error('Server error', { description: 'Could not execute the action.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submit Warehouse Form ──────────────────────────────────────────────────
  async function handleWarehouseSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!whName || !whLocation) {
      toast.error('Missing fields', { description: 'Please fill in Warehouse Name and Location.' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: whName, location: whLocation }),
      })

      if (res.ok) {
        toast.success('Warehouse created successfully!')
        setWhName('')
        setWhLocation('')
        setShowWarehouseModal(false)
        void fetchData()
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error('Action failed', { description: errData.error || 'Please try again.' })
      }
    } catch {
      toast.error('Server error', { description: 'Could not connect to the server.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-blue-500" />
        <p className="text-zinc-500 font-medium animate-pulse">Loading admin dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Premium Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-zinc-900 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link href="/products" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-200 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Storefront
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Retail Admin Console</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 shadow-sm animate-pulse">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Admin Mode Activated
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Securely configure inventory products, warehouse locations, and manage direct stock levels.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleOpenCreate} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer">
            <Plus className="h-4 w-4" /> Add Product
          </Button>
          <Button onClick={() => setShowWarehouseModal(true)} className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold cursor-pointer border border-zinc-700">
            <Plus className="h-4 w-4" /> Add Warehouse
          </Button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-zinc-900 gap-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'products' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Products ({products.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`pb-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'warehouses' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Warehouses ({warehouses.length})
          </span>
        </button>
      </div>

      {/* ── Products Tab Content ─────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden shadow-md shadow-black/20 border-zinc-850 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-4">
                  <div className="h-20 w-20 bg-zinc-900 border border-zinc-800 rounded-lg relative overflow-hidden flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl || `https://picsum.photos/seed/${product.id}/150/150`}
                      alt={product.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h2 className="text-lg font-bold text-zinc-100 truncate leading-snug">{product.name}</h2>
                      <span className="text-lg font-extrabold text-blue-400">${product.price.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1.5">{product.description || 'No description available.'}</p>
                    {product.imageUrl && (
                      <div className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/30 border border-indigo-900/40 rounded px-1.5 py-0.5">
                        <Image className="h-3 w-3" /> Custom Image
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="border-t border-zinc-900 pt-4 space-y-4">
                  {/* Stock Grid Table */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Warehouse Stock Matrix</span>
                    <div className="rounded-lg border border-zinc-850 bg-zinc-950/40 overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
                            <th className="px-3 py-2 font-bold">Warehouse</th>
                            <th className="px-3 py-2 font-bold text-center">Total</th>
                            <th className="px-3 py-2 font-bold text-center">Reserved</th>
                            <th className="px-3 py-2 font-bold text-center">Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {product.warehouses.map((whStock) => {
                            const wh = warehouses.find((w) => w.id === whStock.warehouseId)
                            return (
                              <tr key={whStock.warehouseId} className="border-b border-zinc-900/60 hover:bg-zinc-900/30 transition-colors">
                                <td className="px-3 py-2">
                                  <div className="font-semibold text-zinc-200">{wh?.name ?? 'Unknown'}</div>
                                  <div className="text-[10px] text-zinc-500 font-medium">{wh?.location ?? ''}</div>
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-zinc-200">{whStock.total}</td>
                                <td className="px-3 py-2 text-center font-semibold text-amber-400">{whStock.reserved}</td>
                                <td className={`px-3 py-2 text-center font-bold ${whStock.available > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {whStock.available}
                                </td>
                              </tr>
                            )
                          })}
                          {product.warehouses.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-4 text-center text-zinc-500 font-medium">
                                No warehouse stock mapped.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      onClick={() => handleOpenEdit(product)}
                      variant="outline"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5" /> Edit Details & Stock
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Warehouses Tab Content ───────────────────────────────────────────── */}
      {activeTab === 'warehouses' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-zinc-950/40 rounded-xl border border-zinc-850 shadow-md shadow-black/20 divide-y divide-zinc-900">
            {warehouses.map((warehouse) => (
              <div key={warehouse.id} className="flex items-center justify-between p-4 hover:bg-zinc-900/30 transition-colors">
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-100">{warehouse.name}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-zinc-500" /> {warehouse.location}
                  </p>
                </div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 rounded px-2.5 py-1 border border-zinc-800">
                  Active
                </div>
              </div>
            ))}
            {warehouses.length === 0 && (
              <div className="p-8 text-center text-zinc-500 font-medium">
                No warehouses configured yet. Click &ldquo;Add Warehouse&rdquo; to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRODUCT MODAL (Add/Edit) ────────────────────────────────────────── */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-200">
          <div className="relative w-full max-w-lg bg-zinc-950 rounded-2xl shadow-2xl shadow-black/80 border border-zinc-850 overflow-hidden transform scale-100 transition-all duration-300 flex flex-col max-h-[90vh]">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />
            
            <button
              onClick={() => setShowProductModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <form onSubmit={handleProductSubmit} className="flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-zinc-100">
                    {editingProduct ? 'Edit Product & Stock' : 'Create New Product'}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Fill in the details below. Creating a product maps it across all active warehouses automatically.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Basic Metadata */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="prod-name" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Product Name</label>
                      <input
                        id="prod-name"
                        type="text"
                        required
                        placeholder="e.g. Premium Cotton Socks"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="prod-price" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Price (USD)</label>
                      <input
                        id="prod-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="e.g. 19.99"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label htmlFor="prod-desc" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Description</label>
                    <textarea
                      id="prod-desc"
                      rows={2}
                      placeholder="Enter a brief product overview..."
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors resize-none"
                    />
                  </div>

                  {/* Product Image Selection (Local Upload or Web URL) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Image className="h-3.5 w-3.5 text-zinc-500" /> Product Image
                      </span>
                      {prodImageUrl && (
                        <button
                          type="button"
                          onClick={() => setProdImageUrl('')}
                          className="text-[10px] font-bold text-rose-500 hover:text-rose-400 transition-colors uppercase tracking-wider cursor-pointer"
                        >
                          Clear Image
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Local File Upload Button Zone */}
                      <div className="rounded-xl border border-dashed border-zinc-800 hover:border-blue-500 bg-zinc-900/30 p-4 transition-colors flex flex-col items-center justify-center relative min-h-[110px]">
                        <input
                          id="prod-file-upload"
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onloadend = () => {
                                setProdImageUrl(reader.result as string)
                                toast.success('Image loaded from device!')
                              }
                              reader.readAsDataURL(file)
                            }
                          }}
                        />
                        <Plus className="h-5 w-5 text-zinc-500 mb-1" />
                        <span className="text-xs font-bold text-zinc-300">Choose local image</span>
                        <span className="text-[10px] text-zinc-500 mt-0.5">Supports PNG, JPG, WEBP</span>
                      </div>

                      {/* Image Preview / Details zone */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-3 flex items-center gap-3">
                        <div className="h-16 w-16 bg-zinc-900 border border-zinc-800 rounded-lg relative overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {prodImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={prodImageUrl}
                              alt="Upload preview"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <Image className="h-6 w-6 text-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Preview Status</span>
                          <span className={`text-xs font-bold block truncate mt-0.5 ${prodImageUrl ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {prodImageUrl ? (prodImageUrl.startsWith('data:') ? 'Local Device Upload' : 'Custom Web URL') : 'Default Picsum Seed'}
                          </span>
                          <span className="text-[9px] text-zinc-500 block truncate mt-0.5">
                            {prodImageUrl ? (prodImageUrl.startsWith('data:') ? `${Math.round(prodImageUrl.length / 1024)} KB encoded` : prodImageUrl) : 'Using auto-generated seed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Or standard URL input in case they want a web link */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="prod-img" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Or paste direct Web Image URL
                        </label>
                      </div>
                      <input
                        id="prod-img"
                        type="url"
                        placeholder="https://images.unsplash.com/photo-..."
                        value={prodImageUrl.startsWith('data:') ? '' : prodImageUrl}
                        onChange={(e) => setProdImageUrl(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors"
                      />
                    </div>
                  </div>

                  {/* Warehouse Stock Matrix Inputs */}
                  <div className="space-y-3 pt-2">
                    <div className="border-t border-zinc-900 pt-4">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Adjust Warehouse Stock levels</span>
                      <div className="rounded-xl border border-zinc-850 bg-zinc-950/50 p-4 space-y-3">
                        {warehouses.map((w) => (
                          <div key={w.id} className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-zinc-200 truncate">{w.name}</div>
                              <div className="text-[10px] text-zinc-500 font-semibold">{w.location}</div>
                            </div>
                            <div className="w-24">
                              <input
                                type="number"
                                min="0"
                                required
                                value={prodStock[w.id] ?? 0}
                                onChange={(e) => setProdStock({ ...prodStock, [w.id]: parseInt(e.target.value) || 0 })}
                                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-center text-xs font-bold text-zinc-100 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        ))}
                        {warehouses.length === 0 && (
                          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/30 rounded-lg p-2.5">
                            <AlertCircle className="h-4 w-4" />
                            <span>No warehouses found. Please configure a warehouse first.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-zinc-900 bg-zinc-950/80 px-6 py-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  variant="outline"
                  className="cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer text-xs"
                >
                  {submitting ? 'Submitting...' : editingProduct ? 'Save Product Details' : 'Create Product'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── WAREHOUSE MODAL ─────────────────────────────────────────────────── */}
      {showWarehouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-200">
          <div className="relative w-full max-w-md bg-zinc-950 rounded-2xl shadow-2xl shadow-black/80 border border-zinc-850 overflow-hidden transform scale-100 transition-all duration-300 flex flex-col">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />
            
            <button
              onClick={() => setShowWarehouseModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <form onSubmit={handleWarehouseSubmit}>
              <div className="p-6 space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-zinc-100">Add Warehouse Location</h2>
                  <p className="text-xs text-zinc-400">
                    Register a new fulfillment center. This automatically links all products to it at a default stock of 0 units.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="wh-name" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Warehouse Name</label>
                    <input
                      id="wh-name"
                      type="text"
                      required
                      placeholder="e.g. Houston Distribution Center"
                      value={whName}
                      onChange={(e) => setWhName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="wh-loc" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Location Address</label>
                    <input
                      id="wh-loc"
                      type="text"
                      required
                      placeholder="e.g. Houston, TX"
                      value={whLocation}
                      onChange={(e) => setWhLocation(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-medium placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none shadow-sm transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-zinc-900 bg-zinc-950/80 px-6 py-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  onClick={() => setShowWarehouseModal(false)}
                  variant="outline"
                  className="cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold cursor-pointer text-xs border border-zinc-700"
                >
                  {submitting ? 'Creating...' : 'Create Warehouse'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
