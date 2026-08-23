# Field contract

The JSON record contains exactly `supplier`, `invoice_number`, `invoice_date`, `currency`, `subtotal`, `tax`, `total`, and `warnings`.

Unknown values are `null`. `warnings` is an array of strings. When all amounts are known, verify `subtotal + tax == total` within 0.01.
