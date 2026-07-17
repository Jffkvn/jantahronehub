import type { ItemCategory } from '../api/inventory'

interface CategoryChoiceProps {
  categories: ItemCategory[]
  categoryId: string
  newCategoryName: string
  newCategoryDescription: string
  onCategoryIdChange: (value: string) => void
  onNewCategoryNameChange: (value: string) => void
  onNewCategoryDescriptionChange: (value: string) => void
}

export function CategoryChoice({
  categories,
  categoryId,
  newCategoryName,
  newCategoryDescription,
  onCategoryIdChange,
  onNewCategoryNameChange,
  onNewCategoryDescriptionChange,
}: CategoryChoiceProps) {
  const isNew = categoryId === '__new__'

  return (
    <div className="oh-field oh-form-grid__full">
      <label className="oh-field__label" htmlFor="inventory-category-choice">Category</label>
      <select
        className="oh-select"
        id="inventory-category-choice"
        value={categoryId}
        onChange={(event) => onCategoryIdChange(event.target.value)}
        required
      >
        <option value="">Select an existing category…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
        <option value="__new__">+ Create new category</option>
      </select>
      {isNew ? (
        <div className="oh-inline-setup-fields">
          <div className="oh-field">
            <label className="oh-field__label" htmlFor="inventory-new-category-name">New category name</label>
            <input
              className="oh-input"
              id="inventory-new-category-name"
              value={newCategoryName}
              onChange={(event) => onNewCategoryNameChange(event.target.value)}
              required
            />
          </div>
          <div className="oh-field">
            <label className="oh-field__label" htmlFor="inventory-new-category-description">Category description (optional)</label>
            <input
              className="oh-input"
              id="inventory-new-category-description"
              value={newCategoryDescription}
              onChange={(event) => onNewCategoryDescriptionChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
