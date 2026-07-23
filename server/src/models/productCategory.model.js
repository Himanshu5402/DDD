import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Admin-defined product categories. The built-in defaults live in
 * PRODUCT_CATEGORIES (product.model.js); rows here extend that list at
 * runtime — created explicitly from the Products page, or auto-registered
 * when a product is saved with a previously unknown category.
 */
const productCategorySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('ProductCategory', productCategorySchema);
