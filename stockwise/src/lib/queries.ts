// src/lib/queries.ts
import { client } from './sanity';
import { groq } from 'next-sanity';

// Stock Items
export async function getStockItems() {
    return client.fetch(groq`*[_type == "StockItem"]{
    _id, name, sku, category->{title}, unitOfMeasure, 
    minimumStockLevel, supplier->{name}, imageUrl
  } | order(name asc)`);
}

export async function getStockItem(id: string) {
    return client.fetch(groq`*[_type == "StockItem" && _id == $id][0]{
    _id, name, sku, category->{title}, unitOfMeasure, 
    minimumStockLevel, reorderQuantity, description,
    supplier->{name}, imageUrl
  }`, { id });
}

// AppUsers
export async function getAppUsers() {
    return client.fetch(groq`*[_type == "AppUser"]{
    _id, name, email, role, isActive,
    "associatedSite": associatedSite->name,
    "profileImage": profileImage.asset->url
  } | order(name asc)`);
}

// Purchase Orders
export async function getPurchaseOrders() {
    return client.fetch(groq`*[_type == "PurchaseOrder"]{
    _id, poNumber, orderDate, supplier->{name}, status,
    totalAmount, orderedBy->{name}
  } | order(orderDate desc)`);
}

// Add similar functions for all your schema types...