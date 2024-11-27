import './scss/styles.scss';

import { EventEmitter } from './components/base/events';
import { LarekApi } from './components/LarekApi';
import { cloneTemplate, ensureElement } from './utils/utils';
import { CDN_URL, API_URL } from './utils/constants';
import { AppState, CatalogChangeEvent } from './components/AppData';
import { Page } from './components/Page';
import { Card } from './components/Card';
import { Modal } from './components/Modal';
import { Basket } from './components/Basket';
import { OrdersDelivery, paymentMethod} from './components/OrderDelivery';
import { OrdersContacts } from './components/OrderContacts';
import { Success } from './components/Succes';
import { ICard, IOrdersContacts, IOrdersDelivery } from './types';

const cardCatalogTemplate = ensureElement<HTMLTemplateElement>('#card-catalog');
const cardPreviewTemplate = ensureElement<HTMLTemplateElement>('#card-preview');
const basketTemplate = ensureElement<HTMLTemplateElement>('#basket');
const cardBasketTemplate = ensureElement<HTMLTemplateElement>('#card-basket');
const ordersDeliveryTemplate = ensureElement<HTMLTemplateElement>('#order');
const ordersContactsTemplate = ensureElement<HTMLTemplateElement>('#contacts');
const successTemplate = ensureElement<HTMLTemplateElement>('#success');

const events = new EventEmitter();
const api = new LarekApi(CDN_URL, API_URL);
const appState = new AppState({}, events);

const page = new Page(document.body, events);
const modal = new Modal(ensureElement<HTMLElement>('#modal-container'), events);
const basket = new Basket(cloneTemplate(basketTemplate), events);
const ordersDelivery = new OrdersDelivery(cloneTemplate(ordersDeliveryTemplate), events, {
  onClick: (event: Event) => {
    events.emit('payment:changed', event.target)
  }
});
const ordersContacts = new OrdersContacts(cloneTemplate(ordersContactsTemplate), events);


api.getCardsList()
	.then(appState.setCards.bind(appState))
	.catch((err) => {
		console.error(err);
});


events.on<CatalogChangeEvent>('items:changed', () => { //рендер карточек
  page.catalog = appState.catalog.map(item => {
    const card = new Card(cloneTemplate(cardCatalogTemplate), {
      onClick: () => events.emit('card:select', item)
    });
    return card.render({
      category: item.category,
      title: item.title,
      image: item.image,
      price: item.price,
    });
  });
});

events.on('card:select', (item: ICard) => { // выбор карточки
  appState.setPreview(item);
});

events.on('preview:changed', (item: ICard) => { //открытие попапа карточки
  const card = new Card(cloneTemplate(cardPreviewTemplate), {
    onClick: () => {
      events.emit('item:check', item);
      card.buttonText = appState.basket.indexOf(item) < 0 ?
      'В корзину' :
      'Убрать из корзины';
    }
  })

  modal.render({
    content: card.render({
      category: item.category,
      title: item.title,
      image: item.image,
      description: item.description,
      price: item.price,
    })
  })
});

events.on('item:check', (item: ICard) => {  //проверка нахождения товара в корзине
  (appState.basket.indexOf(item) < 0) ?
  events.emit('item:add', item) :
  events.emit('item:delete', item);
});

events.on('item:add', (item: ICard) => { //добавление в корзину
  appState.addItemToBasket(item);
})

events.on('item:delete', (item: ICard) => { //удаление из корзины
  appState.deleteItemFromBasket(item);
})


events.on('basket:changed', (items: ICard[]) => { //изменение состояния заказа и счетчика
  basket.items = items.map((item, count) => {
    const card = new Card(cloneTemplate(cardBasketTemplate), {
      onClick: () => {events.emit('item:delete', item)}
    });
    return card.render({
      title: item.title,
      price: item.price,
      count: (count++).toString(),
    });
  });
  let total = 0;
  items.forEach(item => {
    total = total + item.price;
  });
  basket.total = total;
  appState.order.total = total;
});


events.on('count:changed', () => { //изменение счетчика
  page.counter = appState.basket.length;
});


events.on('basket:open', () => { //открытие корзины
  modal.render({
    content: basket.render({})
  });
});


events.on('order:open', () => { //открытие формы доставки
  modal.render({
    content: ordersDelivery.render({
      payment: '',
      address: '',
      valid: false,
      errors: [],
    })
  });
  appState.order.items = appState.basket.map((item) => item.id);
});


events.on('payment:changed', (target: HTMLElement) => {
  if(!target.classList.contains('button_alt-active')) {
    ordersDelivery.changeButtonsClasses();
    appState.order.payment = paymentMethod[target.getAttribute('name')];
  };
});


events.on(/^order\..*:change/, (data: { field: keyof IOrdersDelivery, value: string }) => {
  appState.setOrdersDelivery(data.field, data.value);
});


events.on('deliveryForm:changed', (errors: Partial<IOrdersDelivery>) => {
  const { payment, address } = errors;
  ordersDelivery.valid = !payment && !address;
  ordersDelivery.errors = Object.values({payment, address}).filter(i => !!i).join('; ');
});


events.on('ordersDelivery:changed' , () => {
  ordersDelivery.valid = true;
});


events.on('order:submit', () => {
  modal.render({
    content: ordersContacts.render({
      email: '',
      phone: '',
      valid: false,
      errors: [],
    })
  });
  appState.order.items = appState.basket.map((item) => item.id);
});


events.on(/^contacts\..*:change/, (data: {field: keyof IOrdersContacts, value: string}) => {
  appState.setOrdersContacts(data.field, data.value)
})


events.on('contactsForm:changed', (errors: Partial<IOrdersContacts>) => {
  const { email, phone } = errors;
  ordersContacts.valid = !email && !phone;
  ordersContacts.errors = Object.values({email, phone}).filter(i => !!i).join('; ');
});


events.on('ordersContacts:changed' , () => {
  ordersContacts.valid = true;
});


events.on('contacts:submit', () => {
  api.orderProducts(appState.order)
  .then(result => {
    appState.clearBasket();
    const success = new Success(cloneTemplate(successTemplate), {
      onClick: () => {
        modal.close();
      }
    });
    success.total = result.total.toString();
    modal.render({
        content: success.render({})
      });
    })
  .catch(error => {
    console.error(error);
  });
});

// Блокируовка страницы если открыта модалка
events.on('modal:open', () => {
  page.locked = true;
});

events.on('modal:close', () => {
  page.locked = false;
});
