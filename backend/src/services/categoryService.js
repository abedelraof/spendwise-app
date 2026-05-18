const categoryModel = require('../models/categoryModel');
const subcategoryModel = require('../models/subcategoryModel');

function matchOrCreateCategory(userId, categoryName, subcategoryName) {
  let cat = categoryModel.findByName(userId, categoryName);
  if (!cat) {
    categoryModel.create(userId, { name: categoryName });
    cat = categoryModel.findByName(userId, categoryName);
  }
  let subId = null;
  if (subcategoryName && cat) {
    const sub = subcategoryModel.findOrCreate(cat.id, userId, subcategoryName);
    subId = sub?.id || null;
  }
  return { category_id: cat?.id || null, subcategory_id: subId };
}

module.exports = { matchOrCreateCategory };
