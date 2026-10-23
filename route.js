/* Только условные связи между объектами. Это НЕ геометрия пешеходных путей.
   Не использовать для расчёта расстояния, времени или навигации.
   После полевой проверки замените coordinates массивом [lon,lat] и status. */
window.BespRoute = {
  status:'unverified',
  label:'Схема маршрута',
  segments:[
    {from:'ryabushinsky',to:'gogol-andreev',status:'unverified',coordinates:null},
    {from:'gogol-andreev',to:'gogol-tomsky',status:'unverified',coordinates:null},
    {from:'gogol-tomsky',to:'mosselprom',status:'unverified',coordinates:null},
    {from:'mosselprom',to:'arseny-morozov',status:'unverified',coordinates:null},
    {from:'arseny-morozov',to:'varvara-morozova',status:'unverified',coordinates:null},
    {from:'varvara-morozova',to:'psychology',status:'unverified',coordinates:null},
    {from:'psychology',to:'old-msu',status:'unverified',coordinates:null}
  ]
};
