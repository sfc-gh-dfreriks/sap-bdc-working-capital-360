# L0 — SAP BDC data products used by Working Capital 360

Zero-copy BDC Connect shares in `dfreriksdemo` (schema `BDCCONNECT`), surfaced as `SAP_WORKING_CAPITAL_360.SAP_BDC_L1` views.

| WCI page | SAP BDC data product (ORD id) | L0 share / table | Role in the app |
|---|---|---|---|
| AR, AP, Overview | Entry View Journal Entry (`sap.s4com:dataProduct:EntryViewJournalEntry:v1`) | `SAP_BDC_DEMO_ENTRY_VIEW_JOURNAL_ENTRY.OPERATIONALACCTGDOCITEM` (10,300 rows) | **Real signal**: customer debit lines → AR invoices, supplier credit lines → AP invoices (3 company codes, 2023-01 → 2025-03) |
| AR, AP | Entry View Journal Entry (clearing history) | `OPLACCTGDOCITEMCLEARINGHISTORY` | Lineage (sample) |
| AP | Supplier Invoice (`sap.s4com:dataProduct:SupplierInvoice:v1`) | `SAP_BDC_DEMO_SUPPLIER_INVOICE.SUPPLIERINVOICE` (500) | Lineage / AP invoice header |
| AP, Early pay | Payment Terms (`sap.s4com:dataProduct:PaymentTerms:v1`) | `SAP_BDC_DEMO_PAYMENT_TERMS.PAYMENTTERMS*` | Terms vocabulary (NT30/45/60/90, 2/10 NET30) |
| AR | Billing Document (`sap.s4com:dataProduct:BillingDocument:v1`) | `SAP_BDC_DEMO_BILLING_DOCUMENT.BILLINGDOCUMENT` | Lineage |
| AR / Collections | Collections Worklist Item, Dispute Case, Promise To Pay | `SAP_BDC_DEMO_COLLECTIONS_WORKLIST_ITEM`, `..._DISPUTE_CASE`, `..._PROMISE_TO_PAY` | Dunning, dispute, promise-to-pay flags (modelled) |
| Cash & Liquidity | Cash Flow (`sap.s4com:dataProduct:CashFlow:v1`), Bank Account, House Bank | `SAP_BDC_DEMO_CASH_FLOW.CASHFLOW / CASHFLOWFORECAST`, `..._BANK_ACCOUNT`, `..._HOUSE_BANK` | Bank structure; balances and 13-week forecast modelled |
| Inventory | Physical Inventory Document (`sap.s4com:dataProduct:PhysicalInventoryDocument:v1`) | `SAP_BDC_DEMO_PHYSICAL_INVENTORY_DOCUMENT.*` | Lineage; inventory values modelled |

**Demo enrichment (flagged `IS_DEMO_ENRICHMENT`)**: the demo tenant leaves `NETDUEDATE`, `CLEARINGDATE`, `PAYMENTTERMS` and `FINANCIALACCOUNTTYPE` empty, and partner keys (C0001…, V0001…) do not match the Customer/Supplier samples. L2 therefore assigns payment terms, payment behaviour, SAP Taulia–style early-pay programs, inventory, bank balances and partner names deterministically (`HASH`). Amounts are converted to USD at fixed illustrative rates (EUR 1.08, JPY 0.0067).
