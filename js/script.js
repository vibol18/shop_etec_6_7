import { Products } from './products.js';
const swiper = new Swiper('.banner', {
            loop: true,
            autoplay: {
                delay: 3000,
                disableOnInteraction: false,
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
        });

const products_container = document.querySelector('.products-container');
Products.forEach((product) => {
    const productElement = document.createElement('div');
    productElement.classList.add('product');
    productElement.innerHTML = `
        <div class="Products">
                <div class="Products">
                    <div class="img">
                        <img src="${product.image}" alt="${product.name}">
                    </div>
                    <div class="price">$${product.price.toFixed(2)}</div>
                    <div class="button" style="display: flex; align-items: center; gap: 20px;">
                        <button class="addTocart" onclick="addToCart(${product.id})">AddToCart</button>
                        <button class="view" onclick="viewProduct(${product.id})">View</button>
                    </div>
                </div>
            </div>
    `;
    products_container.appendChild(productElement);
});

function addToCart(productId) {
    const product = Products.find((p) => p.id === productId);
    if (product) {
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const existingProductIndex = cart.findIndex((item) => item.id === productId);
        if (existingProductIndex !== -1) {
            cart[existingProductIndex].quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        alert(`${product.name} has been added to the cart.`);
    } else {
        alert('Product not found.');
    }
}

function viewProduct(productId) {
    const product = Products.find((p) => p.id === productId);
    if (product) {
        
        localStorage.setItem('viewedProduct', JSON.stringify(product));
        window.location.href = 'view.html';
    } else {
        alert('Product not found.');
    }
}