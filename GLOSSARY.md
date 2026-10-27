# Restaurant Purchasing

Stocklog records restaurant purchases and helps management review purchasing quantities and spending.

## Language

**Purchase**:
A recorded purchase from one supplier on one purchase date, containing one or more item lines. Recording a purchase does not establish whether the supplier has been paid.
_Avoid_: Payment, stock balance

**Purchase line**:
One item, quantity, unit and line total within a purchase.
_Avoid_: Invoice, purchase when referring to a single item line

**Supplier**:
The person or business from whom the restaurant purchases items.
_Avoid_: Customer

**Item**:
A named ingredient, supply or other product purchased by the restaurant.
_Avoid_: Stock balance

**Unit**:
The measure or package used for a purchase quantity, such as kg, litre, tin or carton. Quantities expressed in different units are distinct unless a conversion has explicitly been agreed.

**Line total**:
The amount recorded for one purchase line, expressed in Malaysian ringgit.
_Avoid_: Unit price

**Unit price**:
The line total divided by the quantity in that line's recorded unit.
_Avoid_: Line total

**Invoice number**:
An optional reference supplied with a purchase document. It is not the identity of the purchase record.

**Receipt photo**:
An optional photograph of the supporting document for a purchase.
_Avoid_: Automatically extracted purchase data

**Staff account**:
An individual employee's login with permission to enter purchases and view their own purchase records while active.
_Avoid_: Shared restaurant login

**Manager account**:
A login with permission to review restaurant purchases and administer staff accounts while active.

**Staff workspace**:
The purchase-entry and personal purchase-history interface. Entering this workspace does not change an account's role.
_Avoid_: Staff account when referring to the interface

**Management workspace**:
The interface for restaurant reports, purchase review, staff administration and login history.
_Avoid_: Manager account when referring to the interface

**Inactive account**:
An account without access to restaurant records, even if its login credentials authenticate successfully.

**Monthly item summary**:
The purchased quantities and spending for each item and unit within a purchase-date month.
_Avoid_: Current inventory, stock on hand

**Supplier spending summary**:
Recorded purchase amounts grouped by supplier for the selected period and filters.
_Avoid_: Amount paid, outstanding balance

**Login history**:
A record of successful authentications and whether restaurant access was granted at that time.
_Avoid_: Visit history, online status, purchase change history

**Purchase correction**:
A manager's amendment to a saved purchase to correct an error, accompanied by the original and revised information, who made the amendment, when and why.
_Avoid_: Login event

**Purchase change history**:
The retained record of corrections or voiding of a purchase, identifying the actor, time and reason as well as any original and revised information.
_Avoid_: Login history

**Voided purchase**:
A purchase retained for historical reference but marked invalid and excluded from effective purchase quantities and spending totals.
_Avoid_: Deleted purchase

**Correction request**:
An employee's report of an error in their saved purchase, submitted in the app for a manager to review. A request does not itself change the purchase or its reported amount.
_Avoid_: Purchase approval
