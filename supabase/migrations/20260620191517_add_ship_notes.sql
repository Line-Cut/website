-- Add optional customer order notes to orders.
alter table public.orders add column if not exists ship_notes text;
