import { defineCustomElement } from 'vue'
import DataBoundComponent from '../components/data-bound/data-bound.ce.vue'

const DataBound = defineCustomElement(DataBoundComponent);

customElements.define('data-bound', DataBound);