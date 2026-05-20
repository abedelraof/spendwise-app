const categoryModel = require('../models/categoryModel');
const subcategoryModel = require('../models/subcategoryModel');

async function matchOrCreateCategory(userId, categoryName, subcategoryName) {
  let cat = await categoryModel.findByName(userId, categoryName);
  if (!cat) {
    await categoryModel.create(userId, { name: categoryName });
    cat = await categoryModel.findByName(userId, categoryName);
  }
  let subId = null;
  if (subcategoryName && cat) {
    const sub = await subcategoryModel.findOrCreate(cat.id, userId, subcategoryName);
    subId = sub?.id || null;
  }
  return { category_id: cat?.id || null, subcategory_id: subId };
}

module.exports = { matchOrCreateCategory };
