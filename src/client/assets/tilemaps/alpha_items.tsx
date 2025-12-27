<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="alpha_items" tilewidth="63" tileheight="60" tilecount="3" columns="0" objectalignment="bottomleft">
 <grid orientation="orthogonal" width="1" height="1"/>
 <tile id="0">
  <properties>
   <property name="isItem" type="bool" value="true"/>
   <property name="itemID" value="key"/>
   <property name="itemType" value="object"/>
   <property name="name" value="Gold Key"/>
   <property name="texture" value="key"/>
  </properties>
  <image source="key.png" width="63" height="58"/>
 </tile>
 <tile id="1">
  <properties>
   <property name="equipSlot" value="legs"/>
   <property name="isItem" type="bool" value="true"/>
   <property name="itemID" value="pants"/>
   <property name="itemType" value="clothing"/>
   <property name="name" value="Blue Pants"/>
   <property name="texture" value="pants"/>
  </properties>
  <image source="pants.png" width="37" height="60"/>
 </tile>
 <tile id="2">
  <properties>
   <property name="equipSlot" value="torsoOuter"/>
   <property name="isItem" type="bool" value="true"/>
   <property name="itemID" value="shirt"/>
   <property name="itemType" value="clothing"/>
   <property name="name" value="Pink Shirt"/>
   <property name="texture" value="shirt"/>
  </properties>
  <image source="shirt.png" width="63" height="58"/>
 </tile>
</tileset>
