@shop @checkout
Feature: Checkout
  Customers pay for the items in their **shopping cart**.
  Prices are shown in `CHF` and include VAT.

  - Payment by card or invoice
  - See [Gherkin reference](https://cucumber.io/docs/gherkin/reference/)

  Background:
    Given the product catalogue contains:
      | product  | price |
      | Notebook | 4.50  |
      | Pen      | 1.20  |

  Scenario: Invoice is sent as PDF
    Given a paid order
    When the order is confirmed
    Then an e-mail is sent with the body:
      """markdown
      # Thank you for your order

      Your invoice is attached.
      """
    * the invoice is archived

  Rule: An order needs at least one item

    Example: Empty cart cannot be checked out
      Given an empty shopping cart
      When the customer starts the checkout
      Then the message "Your cart is empty" is shown

  Rule: Discounts are applied to the total

    # Discount codes come from the marketing team
    @discount
    Scenario Outline: Discount code <code>
      Given a shopping cart with 2 "Notebook"
      When the customer enters the discount code "<code>"
      Then the total is <total> CHF

      Examples: Valid codes
        | code    | total |
        | WELCOME | 8.10  |
        | VIP20   | 7.20  |

      @invalid
      Examples: Invalid codes
        | code | total |
        | NOPE | 9.00  |
