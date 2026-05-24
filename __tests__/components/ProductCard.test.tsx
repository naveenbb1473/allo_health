/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ProductCard } from '@/components/ProductCard'

const mockProduct = {
  id: 'prod_123',
  name: 'Test Product',
  description: 'This is a test product',
  price: 99.99,
  warehouses: [
    {
      warehouseId: 'wh_1',
      total: 10,
      reserved: 2,
      available: 8,
    },
    {
      warehouseId: 'wh_2',
      total: 5,
      reserved: 5,
      available: 0,
    },
  ],
}

const mockWarehouses = [
  { id: 'wh_1', name: 'New York Fulfillment Center', location: 'NY' },
  { id: 'wh_2', name: 'Los Angeles Distribution Hub', location: 'LA' },
]

test('renders product information correctly', () => {
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId="wh_1"
      warehouses={mockWarehouses}
      onReserve={vi.fn()}
    />
  )

  // Name and price
  expect(screen.getByText('Test Product')).toBeInTheDocument()
  expect(screen.getByText('$99.99')).toBeInTheDocument()
  expect(screen.getByText('This is a test product')).toBeInTheDocument()

  // Stock badge
  expect(screen.getByText('8 available')).toBeInTheDocument()

  // Stock details
  expect(screen.getByText('Total')).toBeInTheDocument()
  expect(screen.getByText('10')).toBeInTheDocument()
  expect(screen.getByText('Reserved')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('Available')).toBeInTheDocument()
  expect(screen.getByText('8')).toBeInTheDocument()

  // Reserve button
  const button = screen.getByRole('button', { name: /Reserve Test Product/i })
  expect(button).toBeInTheDocument()
  expect(button).not.toBeDisabled()
})

test('disables reserve button and shows out of stock when available is 0', () => {
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId="wh_2"
      warehouses={mockWarehouses}
      onReserve={vi.fn()}
    />
  )

  // Stock badge
  expect(screen.getByText('Out of Stock', { selector: 'span' })).toBeInTheDocument()

  // Reserve button
  const button = screen.getByRole('button', { name: /Test Product is out of stock/i })
  expect(button).toBeInTheDocument()
  expect(button).toBeDisabled()
})

test('disables reserve button when no warehouse is selected', () => {
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId=""
      warehouses={mockWarehouses}
      onReserve={vi.fn()}
    />
  )

  // Reserve button
  const button = screen.getByRole('button', { name: /Select a warehouse to reserve/i })
  expect(button).toBeInTheDocument()
  expect(button).toBeDisabled()
})

test('opens confirmation dialog and calls onReserve with correct arguments when confirm is clicked', () => {
  const onReserveMock = vi.fn()
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId="wh_1"
      warehouses={mockWarehouses}
      onReserve={onReserveMock}
    />
  )

  // 1. Click initial reserve button
  const reserveBtn = screen.getByRole('button', { name: /Reserve Test Product/i })
  fireEvent.click(reserveBtn)

  // 2. The confirmation dialog should now be visible
  expect(screen.getByRole('heading', { name: /Confirm Reservation/i })).toBeInTheDocument()

  // 3. Click the confirm button in the modal
  const confirmBtn = screen.getByRole('button', { name: /Confirm Reservation/i })
  fireEvent.click(confirmBtn)

  // 4. Verification
  expect(onReserveMock).toHaveBeenCalledTimes(1)
  expect(onReserveMock).toHaveBeenCalledWith('prod_123', 'wh_1', 1)
})

test('allows changing quantity via slider and calls onReserve with correct quantity', () => {
  const onReserveMock = vi.fn()
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId="wh_1"
      warehouses={mockWarehouses}
      onReserve={onReserveMock}
    />
  )

  // 1. Click initial reserve button to open modal
  const reserveBtn = screen.getByRole('button', { name: /Reserve Test Product/i })
  fireEvent.click(reserveBtn)

  // 2. Change the slider value to 5
  const slider = screen.getByRole('slider')
  fireEvent.change(slider, { target: { value: '5' } })

  // 3. Click the confirm button inside the modal
  const confirmBtn = screen.getByRole('button', { name: /Confirm Reservation/i })
  fireEvent.click(confirmBtn)

  // 4. Verify onReserve is called with quantity=5
  expect(onReserveMock).toHaveBeenCalledTimes(1)
  expect(onReserveMock).toHaveBeenCalledWith('prod_123', 'wh_1', 5)
})

test('shows reserving state when isReserving is true', () => {
  render(
    <ProductCard
      product={mockProduct}
      selectedWarehouseId="wh_1"
      warehouses={mockWarehouses}
      onReserve={vi.fn()}
      isReserving={true}
    />
  )

  const button = screen.getByRole('button')
  expect(button).toHaveTextContent('Reserving…')
  expect(button).toBeDisabled()
})

